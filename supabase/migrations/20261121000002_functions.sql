-- KanaBloom server-side logic: role checks, no-Kanji gate, signup, audit,
-- session/heartbeat tracking, server-graded quizzes, progress, dashboards, admin analytics.
-- Every SECURITY DEFINER function pins search_path and checks the caller itself.

-- ====================================================================
-- Role helpers
-- ====================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.require_active_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and status = 'active') then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  return uid;
end $$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Owner access required' using errcode = '42501'; end if;
  return auth.uid();
end $$;

-- ====================================================================
-- No-Kanji validator (authoritative copy; mirrors supabase/functions/_shared/kanji.ts)
-- ====================================================================
create or replace function public.find_kanji(t text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct m[1]), '{}')
  from regexp_matches(coalesce(t, ''),
    '([⺀-⿟々-〇〡-〩〸-〻㐀-䶿一-鿿豈-﫿\U00020000-\U0003134F])', 'g') as m;
$$;

-- Walk a jsonb document and return every string field that contains Kanji.
create or replace function public.find_kanji_json(doc jsonb, base text default '')
returns table (path text, chars text[])
language plpgsql immutable as $$
declare k text; v jsonb; i int;
begin
  case jsonb_typeof(doc)
    when 'string' then
      chars := public.find_kanji(doc #>> '{}');
      if cardinality(chars) > 0 then path := coalesce(nullif(base, ''), '(value)'); return next; end if;
    when 'object' then
      for k, v in select * from jsonb_each(doc) loop
        return query select * from public.find_kanji_json(v, case when base = '' then k else base || '.' || k end);
      end loop;
    when 'array' then
      for i in 0 .. jsonb_array_length(doc) - 1 loop
        return query select * from public.find_kanji_json(doc -> i, base || '[' || i || ']');
      end loop;
    else null;
  end case;
end $$;

-- Raises a clear error listing every offending field. Never strips or replaces characters.
create or replace function public.assert_no_kanji(entity text, fields jsonb) returns void
language plpgsql immutable as $$
declare report text;
begin
  select string_agg(format('%s: %s', path, array_to_string(chars, ' ')), '; ')
    into report from public.find_kanji_json(fields);
  if report is not null then
    raise exception 'Kanji is not allowed in published KanaBloom content (%).', entity
      using errcode = '23514', detail = report,
            hint = 'Rewrite the listed fields using hiragana, katakana or romaji only.';
  end if;
end $$;

create or replace function public.trg_lessons_no_kanji() returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    perform public.assert_no_kanji('lesson', jsonb_build_object('title', new.title, 'summary', new.summary, 'content', new.content));
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger lessons_no_kanji before insert or update on public.lessons for each row execute function public.trg_lessons_no_kanji();

create or replace function public.trg_quizzes_no_kanji() returns trigger language plpgsql as $$
declare q jsonb;
begin
  if new.status = 'published' then
    perform public.assert_no_kanji('quiz', jsonb_build_object('title', new.title, 'questions', new.questions));
    if jsonb_array_length(new.questions) = 0 then
      raise exception 'A published quiz needs at least one question' using errcode = '23514';
    end if;
    for q in select * from jsonb_array_elements(new.questions) loop
      if jsonb_typeof(q -> 'choices') <> 'array' or jsonb_array_length(q -> 'choices') < 2
         or jsonb_typeof(q -> 'answer') <> 'number'
         or (q ->> 'answer')::int < 0 or (q ->> 'answer')::int >= jsonb_array_length(q -> 'choices')
         or coalesce(q ->> 'prompt', '') = '' then
        raise exception 'Every quiz question needs a prompt, at least 2 choices and a valid answer index' using errcode = '23514';
      end if;
    end loop;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger quizzes_no_kanji before insert or update on public.quizzes for each row execute function public.trg_quizzes_no_kanji();

create or replace function public.trg_videos_no_kanji() returns trigger language plpgsql as $$
begin
  if new.status = 'published' then
    perform public.assert_no_kanji('video', jsonb_build_object(
      'title', new.title, 'description', new.description, 'captions', new.captions_vtt,
      'script', new.generation -> 'script'));
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger videos_no_kanji before insert or update on public.videos for each row execute function public.trg_videos_no_kanji();

-- Characters are always validated (they are reference content even before publishing).
create or replace function public.trg_characters_no_kanji() returns trigger language plpgsql as $$
begin
  perform public.assert_no_kanji('character', jsonb_build_object(
    'char', new.char, 'pronunciation', new.pronunciation, 'example_word', new.example_word,
    'example_romaji', new.example_romaji, 'example_meaning', new.example_meaning));
  if new.script = 'hiragana' and new.char !~ '^[ぁ-ゟ]$' then
    raise exception 'Hiragana entry % is not a hiragana character', new.char using errcode = '23514';
  elsif new.script = 'katakana' and new.char !~ '^[゠-ヿ]$' then
    raise exception 'Katakana entry % is not a katakana character', new.char using errcode = '23514';
  end if;
  return new;
end $$;
create trigger characters_no_kanji before insert or update on public.characters for each row execute function public.trg_characters_no_kanji();

-- ====================================================================
-- Signup: every new auth user becomes a LEARNER. Metadata cannot request a role.
-- ====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare nm text;
begin
  nm := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100);
  if nm = '' then nm := split_part(new.email, '@', 1); end if;
  insert into public.profiles (id, student_id, full_name, email, role, registered_at)
  values (
    new.id,
    'KB-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.student_number_seq')::text, 6, '0'),
    nm, new.email, 'learner', coalesce(new.created_at, now())
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Keep profile email in sync when the auth email changes.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function public.handle_user_email_change();

-- Learners may only change their own name and timezone. Role, status, ids and dates are locked.
-- Only the database owner / service role (server-side) can create or change the owner role.
-- SECURITY INVOKER on purpose: current_user must reflect the real caller.
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare privileged boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
                             or coalesce(auth.role(), '') = 'service_role';
begin
  if privileged then return new; end if;
  if new.id is distinct from old.id or new.student_id is distinct from old.student_id
     or new.email is distinct from old.email or new.registered_at is distinct from old.registered_at
     or new.created_at is distinct from old.created_at then
    raise exception 'These profile fields cannot be changed' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    raise exception 'Roles can only be changed by the server-side owner setup' using errcode = '42501';
  end if;
  if not public.is_admin() then
    if old.id <> auth.uid() then raise exception 'Not allowed' using errcode = '42501'; end if;
    if new.status is distinct from old.status
       or new.last_login_at is distinct from old.last_login_at
       or new.last_activity_at is distinct from old.last_activity_at then
      raise exception 'Learners cannot change account status or activity fields' using errcode = '42501';
    end if;
  elsif old.id = auth.uid() and new.status <> 'active' then
    raise exception 'The owner account cannot suspend itself' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- Server-side owner bootstrap. EXECUTE is revoked from client roles (see grants migration).
create or replace function public.promote_to_owner(p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An owner account already exists' using errcode = '23505';
  end if;
  select id into pid from public.profiles where lower(email) = lower(p_email);
  if pid is null then raise exception 'No user with email %', p_email; end if;
  update public.profiles set role = 'admin', status = 'active' where id = pid;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, after)
  values (pid, 'owner_created', 'profile', pid, jsonb_build_object('email', p_email));
  return 'Owner role granted to ' || p_email;
end $$;

-- ====================================================================
-- Audit trail for every owner change to content and accounts
-- ====================================================================
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); rec_id uuid;
begin
  -- Only audit changes made by the owner through the app (learner RPC side-effects are not admin actions).
  if actor is null or not public.is_admin() then
    return coalesce(new, old);
  end if;
  rec_id := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (actor, lower(tg_op), tg_table_name, rec_id,
          case when tg_op <> 'INSERT' then to_jsonb(old) - 'stroke_points' - 'stroke_paths' end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - 'stroke_points' - 'stroke_paths' end);
  return coalesce(new, old);
end $$;
create trigger audit_lessons    after insert or update or delete on public.lessons    for each row execute function public.trg_audit();
create trigger audit_quizzes    after insert or update or delete on public.quizzes    for each row execute function public.trg_audit();
create trigger audit_videos     after insert or update or delete on public.videos     for each row execute function public.trg_audit();
create trigger audit_characters after insert or update or delete on public.characters for each row execute function public.trg_audit();
create trigger audit_profiles_update after update on public.profiles for each row
  when (old.status is distinct from new.status or old.full_name is distinct from new.full_name or old.role is distinct from new.role)
  execute function public.trg_audit();
create trigger audit_profiles_delete after delete on public.profiles for each row execute function public.trg_audit();

-- ====================================================================
-- Activity logging (learner-callable for a fixed set of view events only)
-- ====================================================================
create or replace function public.log_event(p_user uuid, p_type text, p_entity_type text, p_entity uuid, p_meta jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.activity_logs (user_id, event_type, entity_type, entity_id, metadata)
  values (p_user, p_type, p_entity_type, p_entity, coalesce(p_meta, '{}'::jsonb));
  update public.profiles set last_activity_at = now() where id = p_user;
$$;

create or replace function public.record_login(p_timezone text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user();
begin
  update public.profiles set last_login_at = now(),
    timezone = case when p_timezone is not null and p_timezone in (select name from pg_timezone_names) then p_timezone else timezone end
  where id = uid;
  perform public.log_event(uid, 'login', null, null, '{}'::jsonb);
end $$;

-- ====================================================================
-- Active learning time: sessions + heartbeats
--   * The client sends a heartbeat every 30 s ONLY while the learner is active
--     (visible tab + input in the last 60 s). Idle time never produces heartbeats.
--   * The server credits real elapsed time since the last heartbeat, capped at 40 s.
--   * A gap over 90 s (sleep, idle, closed laptop) earns nothing.
--   * Sessions with no heartbeat for 2 minutes are closed as "timeout" at their last heartbeat,
--     which handles browser closures and crashes.
--   * One open session per learner (unique index); a new device/tab supersedes the old one.
-- ====================================================================
create or replace function public.close_stale_sessions(p_user uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  with closed as (
    update public.learning_sessions
       set ended_at = last_heartbeat_at, end_reason = 'timeout'
     where ended_at is null and last_heartbeat_at < now() - interval '2 minutes'
       and (p_user is null or user_id = p_user)
    returning user_id, id
  ), logged as (
    insert into public.activity_logs (user_id, event_type, entity_type, entity_id)
    select user_id, 'session_timeout', 'learning_session', id from closed
  )
  select count(*) into n from closed;
  return n;
end $$;

create or replace function public.credit_time(p_session public.learning_sessions, p_cap int)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  delta numeric := extract(epoch from (now() - p_session.last_heartbeat_at));
  credit int;
  tz text;
begin
  if delta > 90 or delta < 0 then credit := 0; else credit := least(floor(delta)::int, p_cap); end if;
  if credit > 0 then
    select timezone into tz from public.profiles where id = p_session.user_id;
    insert into public.learning_time_daily as d (user_id, day, seconds, updated_at)
    values (p_session.user_id, (now() at time zone coalesce(tz, 'UTC'))::date, credit, now())
    on conflict (user_id, day) do update set seconds = d.seconds + excluded.seconds, updated_at = now();
  end if;
  return credit;
end $$;

create or replace function public.start_session(p_client_id text, p_user_agent text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); s public.learning_sessions; sid uuid;
begin
  perform public.close_stale_sessions(uid);
  select * into s from public.learning_sessions where user_id = uid and ended_at is null for update;
  if found then
    if s.client_id = p_client_id then return s.id; end if;    -- same tab reloading: reuse, no duplicate
    update public.learning_sessions set ended_at = now(), end_reason = 'superseded' where id = s.id;
  end if;
  insert into public.learning_sessions (user_id, client_id, user_agent)
  values (uid, p_client_id, left(p_user_agent, 300)) returning id into sid;
  update public.profiles set last_activity_at = now() where id = uid;
  return sid;
end $$;

create or replace function public.heartbeat(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); s public.learning_sessions; credit int;
begin
  select * into s from public.learning_sessions where id = p_session_id and user_id = uid for update;
  if not found or s.ended_at is not null then
    return jsonb_build_object('status', 'ended', 'reason', coalesce(s.end_reason, 'unknown'));
  end if;
  if s.last_heartbeat_at < now() - interval '2 minutes' then
    -- Too late: close the stale session; the client will start a fresh one.
    update public.learning_sessions set ended_at = last_heartbeat_at, end_reason = 'timeout' where id = s.id;
    perform public.log_event(uid, 'session_timeout', 'learning_session', s.id, '{}'::jsonb);
    return jsonb_build_object('status', 'ended', 'reason', 'timeout');
  end if;
  if now() - s.last_heartbeat_at < interval '5 seconds' then
    return jsonb_build_object('status', 'ok', 'active_seconds', s.active_seconds, 'credited', 0);  -- ignore floods
  end if;
  credit := public.credit_time(s, 40);
  update public.learning_sessions set active_seconds = active_seconds + credit, last_heartbeat_at = now() where id = s.id;
  update public.profiles set last_activity_at = now() where id = uid;
  return jsonb_build_object('status', 'ok', 'active_seconds', s.active_seconds + credit, 'credited', credit);
end $$;

create or replace function public.end_session(p_session_id uuid, p_reason text default 'closed') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); s public.learning_sessions; credit int;
begin
  if uid is null then return; end if;
  if p_reason not in ('logout', 'closed') then p_reason := 'closed'; end if;
  select * into s from public.learning_sessions where id = p_session_id and user_id = uid and ended_at is null for update;
  if not found then
    if p_reason = 'logout' then perform public.log_event(uid, 'logout', null, null, '{}'::jsonb); end if;
    return;
  end if;
  credit := public.credit_time(s, 30);
  update public.learning_sessions
     set active_seconds = active_seconds + credit, last_heartbeat_at = now(), ended_at = now(), end_reason = p_reason
   where id = s.id;
  if p_reason = 'logout' then perform public.log_event(uid, 'logout', 'learning_session', s.id, '{}'::jsonb); end if;
end $$;

-- ====================================================================
-- Content access for learners
-- ====================================================================
-- Quiz questions without the answer key.
create or replace function public.get_quiz(p_quiz_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q public.quizzes;
begin
  perform public.require_active_user();
  select * into q from public.quizzes where id = p_quiz_id and status = 'published';
  if not found then raise exception 'Quiz not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', q.id, 'slug', q.slug, 'module', q.module, 'lesson_id', q.lesson_id, 'title', q.title,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('prompt', e -> 'prompt', 'choices', e -> 'choices') order by i), '[]')
                  from jsonb_array_elements(q.questions) with ordinality as t(e, i)));
end $$;

create or replace function public.list_quizzes() returns table (id uuid, slug text, module public.module_type, lesson_id uuid, title text, question_count int)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, slug, module, lesson_id, title, jsonb_array_length(questions)
  from public.quizzes where status = 'published' and public.is_active_user() order by module, title;
$$;

-- Server-graded quiz submission. Idempotent per client_attempt_id.
create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb, p_client_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); q public.quizzes; existing public.quiz_attempts;
        score int := 0; total int; i int; results jsonb := '[]'; correct boolean; chosen int;
begin
  select * into existing from public.quiz_attempts where user_id = uid and client_attempt_id = p_client_attempt_id;
  if found then
    return jsonb_build_object('attempt_id', existing.id, 'score', existing.score, 'total', existing.total,
                              'percent', existing.percent, 'results', existing.answers -> 'results', 'duplicate', true);
  end if;
  select * into q from public.quizzes where id = p_quiz_id and status = 'published';
  if not found then raise exception 'Quiz not found' using errcode = 'P0002'; end if;
  total := jsonb_array_length(q.questions);
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> total then
    raise exception 'Answer every question (expected %)', total using errcode = '22023';
  end if;
  for i in 0 .. total - 1 loop
    chosen := case when jsonb_typeof(p_answers -> i) = 'number' then (p_answers ->> i)::int else null end;
    correct := chosen is not null and chosen = (q.questions -> i ->> 'answer')::int;
    if correct then score := score + 1; end if;
    results := results || jsonb_build_object('chosen', chosen, 'correct', correct,
      'answer', (q.questions -> i ->> 'answer')::int, 'explanation', q.questions -> i -> 'explanation');
  end loop;
  insert into public.quiz_attempts (user_id, quiz_id, client_attempt_id, answers, score, total)
  values (uid, q.id, p_client_attempt_id, jsonb_build_object('chosen', p_answers, 'results', results), score, total)
  returning * into existing;
  perform public.log_event(uid, 'quiz_attempt', 'quiz', q.id, jsonb_build_object('score', score, 'total', total));
  return jsonb_build_object('attempt_id', existing.id, 'score', score, 'total', total, 'percent', existing.percent, 'results', results, 'duplicate', false);
end $$;

-- Mastery rule: viewed, answered its quiz correctly at least once, and written with >= 70% accuracy.
create or replace function public.refresh_mastery(p_user uuid, p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare became boolean;
begin
  update public.student_character_progress
     set mastered = true, mastered_at = now()
   where user_id = p_user and character_id = p_character and not mastered
     and first_viewed_at is not null and quiz_correct >= 1 and best_writing_accuracy >= 70
  returning true into became;
  if became then perform public.log_event(p_user, 'character_mastered', 'character', p_character, '{}'::jsonb); end if;
end $$;

create or replace function public.record_character_view(p_character_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); first boolean;
begin
  if not exists (select 1 from public.characters where id = p_character_id and status = 'published') then
    raise exception 'Character not found' using errcode = 'P0002';
  end if;
  insert into public.student_character_progress (user_id, character_id, first_viewed_at, last_practiced_at)
  values (uid, p_character_id, now(), now())
  on conflict (user_id, character_id) do update
     set first_viewed_at = coalesce(student_character_progress.first_viewed_at, now()), last_practiced_at = now()
  returning (xmax = 0) into first;
  if first then perform public.log_event(uid, 'character_view', 'character', p_character_id, '{}'::jsonb); end if;
  perform public.refresh_mastery(uid, p_character_id);
end $$;

-- Character recognition question, graded on the server against the stored romaji.
create or replace function public.submit_character_quiz(p_character_id uuid, p_choice text, p_client_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); c public.characters; correct boolean; existing public.quiz_attempts;
begin
  select * into existing from public.quiz_attempts where user_id = uid and client_attempt_id = p_client_attempt_id;
  if found then
    return jsonb_build_object('correct', existing.score = 1, 'answer', existing.answers ->> 'answer', 'duplicate', true);
  end if;
  select * into c from public.characters where id = p_character_id and status = 'published';
  if not found then raise exception 'Character not found' using errcode = 'P0002'; end if;
  correct := lower(btrim(coalesce(p_choice, ''))) = c.romaji;
  insert into public.quiz_attempts (user_id, character_id, client_attempt_id, answers, score, total)
  values (uid, c.id, p_client_attempt_id, jsonb_build_object('choice', p_choice, 'answer', c.romaji), case when correct then 1 else 0 end, 1);
  insert into public.student_character_progress (user_id, character_id, quiz_attempts, quiz_correct, last_practiced_at)
  values (uid, c.id, 1, case when correct then 1 else 0 end, now())
  on conflict (user_id, character_id) do update
     set quiz_attempts = student_character_progress.quiz_attempts + 1,
         quiz_correct  = student_character_progress.quiz_correct + case when correct then 1 else 0 end,
         last_practiced_at = now();
  perform public.log_event(uid, 'character_quiz', 'character', c.id, jsonb_build_object('correct', correct));
  perform public.refresh_mastery(uid, c.id);
  return jsonb_build_object('correct', correct, 'answer', c.romaji, 'duplicate', false);
end $$;

-- Called ONLY by the score-writing edge function (service role) after it scores strokes server-side.
create or replace function public.record_writing_attempt(
  p_user_id uuid, p_character_id uuid, p_client_attempt_id uuid, p_mode text,
  p_strokes jsonb, p_accuracy int, p_feedback jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.writing_attempts;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  insert into public.writing_attempts (user_id, character_id, client_attempt_id, mode, strokes, stroke_count, accuracy, feedback)
  values (p_user_id, p_character_id, p_client_attempt_id, p_mode, p_strokes, jsonb_array_length(p_strokes),
          greatest(0, least(100, p_accuracy)), coalesce(p_feedback, '[]'))
  on conflict (user_id, client_attempt_id) do nothing
  returning * into a;
  if a.id is null then
    select * into a from public.writing_attempts where user_id = p_user_id and client_attempt_id = p_client_attempt_id;
    return jsonb_build_object('attempt_id', a.id, 'accuracy', a.accuracy, 'duplicate', true);
  end if;
  insert into public.student_character_progress (user_id, character_id, writing_attempts, best_writing_accuracy, last_practiced_at)
  values (p_user_id, p_character_id, 1, a.accuracy, now())
  on conflict (user_id, character_id) do update
     set writing_attempts = student_character_progress.writing_attempts + 1,
         best_writing_accuracy = greatest(student_character_progress.best_writing_accuracy, excluded.best_writing_accuracy),
         last_practiced_at = now();
  perform public.log_event(p_user_id, 'writing_attempt', 'character', p_character_id, jsonb_build_object('accuracy', a.accuracy, 'mode', p_mode));
  perform public.refresh_mastery(p_user_id, p_character_id);
  return jsonb_build_object('attempt_id', a.id, 'accuracy', a.accuracy, 'duplicate', false);
end $$;

-- Lesson progress only moves forward; completion is permanent.
create or replace function public.record_lesson_progress(p_lesson_id uuid, p_progress int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); r public.student_lesson_progress; was_complete boolean;
begin
  if not exists (select 1 from public.lessons where id = p_lesson_id and status = 'published') then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  p_progress := greatest(0, least(100, coalesce(p_progress, 0)));
  select completed into was_complete from public.student_lesson_progress where user_id = uid and lesson_id = p_lesson_id;
  insert into public.student_lesson_progress as s (user_id, lesson_id, progress_pct, completed, completed_at)
  values (uid, p_lesson_id, p_progress, p_progress = 100, case when p_progress = 100 then now() end)
  on conflict (user_id, lesson_id) do update
     set progress_pct = greatest(s.progress_pct, excluded.progress_pct),
         completed    = s.completed or excluded.completed,
         completed_at = coalesce(s.completed_at, excluded.completed_at),
         last_viewed_at = now()
  returning * into r;
  if was_complete is null then perform public.log_event(uid, 'lesson_view', 'lesson', p_lesson_id, '{}'::jsonb); end if;
  if r.completed and not coalesce(was_complete, false) then
    perform public.log_event(uid, 'lesson_complete', 'lesson', p_lesson_id, '{}'::jsonb);
  end if;
  return to_jsonb(r);
end $$;

-- Video progress: resume position, monotonic max position, completion at 90%.
create or replace function public.record_video_progress(p_video_id uuid, p_position numeric, p_duration numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); v public.videos; r public.video_progress; was boolean; dur numeric;
begin
  select * into v from public.videos where id = p_video_id and status = 'published';
  if not found then raise exception 'Video not found' using errcode = 'P0002'; end if;
  dur := coalesce(nullif(p_duration, 0), v.duration_seconds);
  p_position := greatest(0, least(coalesce(p_position, 0), coalesce(dur, p_position)));
  select completed into was from public.video_progress where user_id = uid and video_id = v.id;
  insert into public.video_progress as p (user_id, video_id, position_seconds, max_position_seconds, duration_seconds, completed, completed_at)
  values (uid, v.id, p_position, p_position, dur, dur is not null and p_position >= dur * 0.9,
          case when dur is not null and p_position >= dur * 0.9 then now() end)
  on conflict (user_id, video_id) do update
     set position_seconds = excluded.position_seconds,
         max_position_seconds = greatest(p.max_position_seconds, excluded.max_position_seconds),
         duration_seconds = coalesce(excluded.duration_seconds, p.duration_seconds),
         completed = p.completed or excluded.completed,
         completed_at = coalesce(p.completed_at, excluded.completed_at)
  returning * into r;
  if r.completed and not coalesce(was, false) then
    perform public.log_event(uid, 'video_complete', 'video', v.id, '{}'::jsonb);
  end if;
  return to_jsonb(r);
end $$;

-- ====================================================================
-- Learner dashboard (own data only)
-- ====================================================================
create or replace function public.user_stats(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  tz text; today date; streak int := 0; d date;
  h_total int; h_done int; k_total int; k_done int; l_total int; l_done int;
  total_sec bigint; avg_quiz numeric; avg_writing numeric; vids_done int; vids_total int;
begin
  select timezone into tz from public.profiles where id = p_user;
  today := (now() at time zone coalesce(tz, 'UTC'))::date;
  select count(*) filter (where c.script = 'hiragana'), count(*) filter (where c.script = 'hiragana' and p.mastered),
         count(*) filter (where c.script = 'katakana'), count(*) filter (where c.script = 'katakana' and p.mastered)
    into h_total, h_done, k_total, k_done
    from public.characters c left join public.student_character_progress p on p.character_id = c.id and p.user_id = p_user
   where c.status = 'published';
  select count(*), count(*) filter (where p.completed) into l_total, l_done
    from public.lessons l left join public.student_lesson_progress p on p.lesson_id = l.id and p.user_id = p_user
   where l.status = 'published';
  select coalesce(sum(seconds), 0) into total_sec from public.learning_time_daily where user_id = p_user;
  select round(avg(percent), 1) into avg_quiz from public.quiz_attempts where user_id = p_user and quiz_id is not null;
  select round(avg(accuracy), 1) into avg_writing from public.writing_attempts where user_id = p_user;
  select count(*) filter (where vp.completed), count(*) into vids_done, vids_total
    from public.videos v left join public.video_progress vp on vp.video_id = v.id and vp.user_id = p_user where v.status = 'published';
  -- Streak: consecutive local days with >= 60 s of active learning, ending today or yesterday.
  d := today;
  if not exists (select 1 from public.learning_time_daily where user_id = p_user and day = d and seconds >= 60) then d := today - 1; end if;
  while exists (select 1 from public.learning_time_daily where user_id = p_user and day = d and seconds >= 60) loop
    streak := streak + 1; d := d - 1;
  end loop;
  return jsonb_build_object(
    'hiragana', jsonb_build_object('total', h_total, 'mastered', h_done),
    'katakana', jsonb_build_object('total', k_total, 'mastered', k_done),
    'lessons',  jsonb_build_object('total', l_total, 'completed', l_done),
    'videos',   jsonb_build_object('total', vids_total, 'completed', vids_done),
    'overall_pct', case when h_total + k_total + l_total = 0 then 0
                        else round((h_done + k_done + l_done) * 100.0 / (h_total + k_total + l_total), 1) end,
    'total_seconds', total_sec, 'streak_days', streak,
    'avg_quiz_pct', avg_quiz, 'avg_writing_accuracy', avg_writing, 'today', today);
end $$;

create or replace function public.my_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := public.require_active_user(); prof public.profiles; stats jsonb; rec jsonb; tz text;
begin
  select * into prof from public.profiles where id = uid;
  tz := prof.timezone;
  stats := public.user_stats(uid);
  -- Recommended next step: first unmastered hiragana, then katakana, then first incomplete lesson.
  select jsonb_build_object('kind', 'character', 'id', c.id, 'script', c.script, 'char', c.char, 'romaji', c.romaji) into rec
    from public.characters c left join public.student_character_progress p on p.character_id = c.id and p.user_id = uid
   where c.status = 'published' and not coalesce(p.mastered, false)
   order by c.script, c.sort_order limit 1;
  if rec is null then
    select jsonb_build_object('kind', 'lesson', 'id', l.id, 'slug', l.slug, 'module', l.module, 'title', l.title) into rec
      from public.lessons l left join public.student_lesson_progress p on p.lesson_id = l.id and p.user_id = uid
     where l.status = 'published' and not coalesce(p.completed, false) order by l.module, l.sort_order limit 1;
  end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('full_name', prof.full_name, 'student_id', prof.student_id, 'email', prof.email,
                                  'registered_at', prof.registered_at, 'timezone', prof.timezone, 'role', prof.role),
    'stats', stats,
    'recommended', rec,
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'seconds', coalesce(d.seconds, 0)) order by g), '[]')
                from generate_series((stats ->> 'today')::date - 13, (stats ->> 'today')::date, interval '1 day') g
                left join public.learning_time_daily d on d.user_id = uid and d.day = g::date),
    'quiz_history', (select coalesce(jsonb_agg(x order by x ->> 'at'), '[]') from (
                       select jsonb_build_object('at', a.created_at, 'percent', a.percent, 'title', q.title) x
                         from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id
                        where a.user_id = uid order by a.created_at desc limit 20) s),
    'writing_history', (select coalesce(jsonb_agg(x order by x ->> 'at'), '[]') from (
                       select jsonb_build_object('at', w.created_at, 'accuracy', w.accuracy, 'char', c.char) x
                         from public.writing_attempts w join public.characters c on c.id = w.character_id
                        where w.user_id = uid order by w.created_at desc limit 30) s),
    'recent', (select coalesce(jsonb_agg(x), '[]') from (
                 select jsonb_build_object('type', a.event_type, 'at', a.created_at, 'metadata', a.metadata,
                   'label', coalesce(c.char, l.title, v.title, q.title)) x
                   from public.activity_logs a
                   left join public.characters c on a.entity_type = 'character' and c.id = a.entity_id
                   left join public.lessons l on a.entity_type = 'lesson' and l.id = a.entity_id
                   left join public.videos v on a.entity_type = 'video' and v.id = a.entity_id
                   left join public.quizzes q on a.entity_type = 'quiz' and q.id = a.entity_id
                  where a.user_id = uid and a.event_type not in ('session_timeout')
                  order by a.created_at desc limit 12) s),
    'achievements', jsonb_build_array(
      jsonb_build_object('key', 'first_bloom', 'title', 'First Bloom', 'description', 'Master your first character',
        'earned', ((stats -> 'hiragana' ->> 'mastered')::int + (stats -> 'katakana' ->> 'mastered')::int) >= 1),
      jsonb_build_object('key', 'ten_petals', 'title', 'Ten Petals', 'description', 'Master 10 characters',
        'earned', ((stats -> 'hiragana' ->> 'mastered')::int + (stats -> 'katakana' ->> 'mastered')::int) >= 10),
      jsonb_build_object('key', 'hiragana_hero', 'title', 'Hiragana Hero', 'description', 'Master all hiragana',
        'earned', (stats -> 'hiragana' ->> 'total')::int > 0 and (stats -> 'hiragana' ->> 'mastered') = (stats -> 'hiragana' ->> 'total')),
      jsonb_build_object('key', 'katakana_hero', 'title', 'Katakana Hero', 'description', 'Master all katakana',
        'earned', (stats -> 'katakana' ->> 'total')::int > 0 and (stats -> 'katakana' ->> 'mastered') = (stats -> 'katakana' ->> 'total')),
      jsonb_build_object('key', 'week_streak', 'title', 'Seven Sunrises', 'description', 'Study 7 days in a row',
        'earned', (stats ->> 'streak_days')::int >= 7),
      jsonb_build_object('key', 'perfect_quiz', 'title', 'Perfect Score', 'description', 'Score 100% on a quiz',
        'earned', exists (select 1 from public.quiz_attempts where user_id = uid and quiz_id is not null and percent = 100)),
      jsonb_build_object('key', 'neat_hand', 'title', 'Neat Hand', 'description', 'Write a character with 90%+ accuracy',
        'earned', exists (select 1 from public.writing_attempts where user_id = uid and accuracy >= 90)),
      jsonb_build_object('key', 'first_hour', 'title', 'First Hour', 'description', 'Learn for one hour in total',
        'earned', (stats ->> 'total_seconds')::bigint >= 3600))
  );
end $$;

-- ====================================================================
-- Owner analytics (every function checks require_admin())
-- ====================================================================
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total_students',  (select count(*) from public.profiles where role = 'learner'),
    'active_students', (select count(*) from public.profiles where role = 'learner' and status = 'active' and last_activity_at >= now() - interval '7 days'),
    'inactive_students', (select count(*) from public.profiles where role = 'learner' and (last_activity_at is null or last_activity_at < now() - interval '7 days')),
    'suspended_students', (select count(*) from public.profiles where role = 'learner' and status = 'suspended'),
    'new_7d',  (select count(*) from public.profiles where role = 'learner' and registered_at >= now() - interval '7 days'),
    'new_30d', (select count(*) from public.profiles where role = 'learner' and registered_at >= now() - interval '30 days'),
    'total_learning_hours', (select round(coalesce(sum(d.seconds), 0) / 3600.0, 1) from public.learning_time_daily d join public.profiles p on p.id = d.user_id and p.role = 'learner'),
    'completed_lessons', (select count(*) from public.student_lesson_progress where completed),
    'avg_quiz_pct', (select round(avg(percent), 1) from public.quiz_attempts where quiz_id is not null),
    'quiz_attempts', (select count(*) from public.quiz_attempts),
    'writing_attempts', (select count(*) from public.writing_attempts),
    'video_starts', (select count(*) from public.video_progress),
    'video_completions', (select count(*) from public.video_progress where completed),
    'recent_registrations', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', id, 'student_id', student_id, 'full_name', full_name, 'email', email, 'registered_at', registered_at) x
          from public.profiles where role = 'learner' order by registered_at desc limit 8) s),
    'registrations_30d', (select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'count',
        (select count(*) from public.profiles p where p.role = 'learner' and (p.registered_at at time zone 'UTC')::date = g::date)) order by g), '[]')
        from generate_series((now() at time zone 'UTC')::date - 29, (now() at time zone 'UTC')::date, interval '1 day') g),
    'learning_14d', (select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'hours',
        (select round(coalesce(sum(seconds), 0) / 3600.0, 2) from public.learning_time_daily d where d.day = g::date)) order by g), '[]')
        from generate_series((now() at time zone 'UTC')::date - 13, (now() at time zone 'UTC')::date, interval '1 day') g)
  );
end $$;

create or replace function public.admin_students(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, student_id text, full_name text, email text, status public.account_status,
               registered_at timestamptz, last_login_at timestamptz, last_activity_at timestamptz,
               learning_seconds bigint, overall_pct numeric, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return query
  with base as (
    select p.* from public.profiles p
     where p.role = 'learner'
       and (p_search is null or p_search = '' or p.full_name ilike '%' || p_search || '%'
            or p.email ilike '%' || p_search || '%' or p.student_id ilike '%' || p_search || '%')
  ), totals as (
    select (select count(*) from public.characters ch where ch.status = 'published')
         + (select count(*) from public.lessons le where le.status = 'published') as denom
  )
  select b.id, b.student_id, b.full_name, b.email, b.status, b.registered_at, b.last_login_at, b.last_activity_at,
         coalesce((select sum(seconds) from public.learning_time_daily d where d.user_id = b.id), 0)::bigint,
         case when t.denom = 0 then 0::numeric else round((
            (select count(*) from public.student_character_progress s where s.user_id = b.id and s.mastered)
          + (select count(*) from public.student_lesson_progress s where s.user_id = b.id and s.completed)) * 100.0 / t.denom, 1) end,
         count(*) over ()
    from base b cross join totals t
   order by b.registered_at desc
   limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_student_report(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare prof public.profiles; tz text; today date;
begin
  perform public.require_admin();
  select * into prof from public.profiles where id = p_user_id;
  if not found then raise exception 'Student not found' using errcode = 'P0002'; end if;
  tz := prof.timezone; today := (now() at time zone tz)::date;
  return jsonb_build_object(
    'profile', to_jsonb(prof),
    'stats', public.user_stats(p_user_id),
    'logins',  (select coalesce(jsonb_agg(created_at order by created_at desc), '[]') from (select created_at from public.activity_logs where user_id = p_user_id and event_type = 'login' order by created_at desc limit 50) s),
    'logouts', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'type', event_type) order by created_at desc), '[]') from (
                  select created_at, event_type from public.activity_logs where user_id = p_user_id and event_type in ('logout', 'session_timeout') order by created_at desc limit 50) s),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' order by s.started_at desc), '[]') from (
                  select * from public.learning_sessions where user_id = p_user_id order by started_at desc limit 50) s),
    'daily',   (select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'seconds', coalesce(d.seconds, 0)) order by g), '[]')
                  from generate_series(today - 29, today, interval '1 day') g
                  left join public.learning_time_daily d on d.user_id = p_user_id and d.day = g::date),
    'weekly',  (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'seconds', s) order by w), '[]') from (
                  select date_trunc('week', day)::date w, sum(seconds) s from public.learning_time_daily
                   where user_id = p_user_id and day >= today - 7 * 12 group by 1) s),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'seconds', s) order by m), '[]') from (
                  select date_trunc('month', day)::date m, sum(seconds) s from public.learning_time_daily
                   where user_id = p_user_id and day >= today - 365 group by 1) s),
    'characters', (select coalesce(jsonb_agg(jsonb_build_object('char', c.char, 'script', c.script, 'romaji', c.romaji,
                     'mastered', coalesce(p.mastered, false), 'viewed', p.first_viewed_at is not null,
                     'quiz', coalesce(p.quiz_correct, 0) || '/' || coalesce(p.quiz_attempts, 0),
                     'best_writing', coalesce(p.best_writing_accuracy, 0)) order by c.script, c.sort_order), '[]')
                   from public.characters c left join public.student_character_progress p on p.character_id = c.id and p.user_id = p_user_id
                  where c.status = 'published'),
    'writing', (select coalesce(jsonb_agg(jsonb_build_object('at', w.created_at, 'char', c.char, 'accuracy', w.accuracy, 'mode', w.mode) order by w.created_at), '[]')
                  from (select * from public.writing_attempts where user_id = p_user_id order by created_at desc limit 100) w
                  join public.characters c on c.id = w.character_id),
    'quizzes', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'title', coalesce(q.title, 'Character: ' || c.char),
                   'score', a.score, 'total', a.total, 'percent', a.percent) order by a.created_at desc), '[]')
                  from (select * from public.quiz_attempts where user_id = p_user_id order by created_at desc limit 100) a
                  left join public.quizzes q on q.id = a.quiz_id left join public.characters c on c.id = a.character_id),
    'lessons', (select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'module', l.module, 'progress', p.progress_pct,
                   'completed', p.completed, 'completed_at', p.completed_at) order by l.module, l.sort_order), '[]')
                  from public.student_lesson_progress p join public.lessons l on l.id = p.lesson_id where p.user_id = p_user_id),
    'videos',  (select coalesce(jsonb_agg(jsonb_build_object('title', v.title, 'position', p.position_seconds, 'max', p.max_position_seconds,
                   'duration', p.duration_seconds, 'completed', p.completed, 'updated_at', p.updated_at)), '[]')
                  from public.video_progress p join public.videos v on v.id = p.video_id where p.user_id = p_user_id),
    'last_activity', (select jsonb_build_object('type', event_type, 'at', created_at) from public.activity_logs
                       where user_id = p_user_id order by created_at desc limit 1)
  );
end $$;
