-- KanaBloom database test suite: roles, RLS isolation, no-Kanji gate,
-- server-side grading, active-time tracking, progress, admin analytics.
-- Run via supabase/tests/run-local.sh. Every failure raises and stops the run.

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set O '99999999-9999-9999-9999-999999999999'

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function t.fails(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ~* pattern or coalesce(pg_catalog.current_setting('t.lastdetail', true), '') ~* pattern then
      raise notice 'ok - % (rejected: %)', msg, sqlerrm; return;
    end if;
    raise exception 'FAILED: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAILED: % — statement succeeded but should have failed', msg;
end $$;
-- Captures error detail text so Kanji reports can be checked.
create function t.error_detail(stmt text) returns text language plpgsql as $$
declare d text;
begin
  begin execute stmt; exception when others then get stacked diagnostics d = pg_exception_detail; return d; end;
  return null;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- ==========================================================
-- 1. Registration always creates a learner
-- ==========================================================
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'aiko@example.com', '{"full_name": "Aiko Learner", "role": "admin"}'),
  (:'B', 'ben@example.com',  '{"full_name": "Ben Learner"}'),
  (:'O', 'owner@example.com', '{"full_name": "Owner"}');

select t.ok((select role from public.profiles where id = :'A') = 'learner', 'signup ignores role in metadata and creates a learner');
select t.ok((select count(*) from public.profiles where role = 'admin') = 0, 'no admin exists after public signups');
select t.ok((select student_id from public.profiles where id = :'A') ~ '^KB-\d{4}-\d{6}$', 'unique student ID generated (KB-YYYY-NNNNNN)');
select t.ok((select count(distinct student_id) from public.profiles) = 3, 'student IDs are unique');
select t.ok((select registered_at from public.profiles where id = :'A') is not null, 'registration timestamp recorded');

-- Owner via server-side setup only
select public.promote_to_owner('owner@example.com');
select t.ok((select role from public.profiles where id = :'O') = 'admin', 'server-side promote_to_owner creates the owner');
select t.fails($$select public.promote_to_owner('ben@example.com')$$, 'already exists', 'a second owner cannot be created');

-- ==========================================================
-- 2. Learner A — permissions
-- ==========================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

select t.ok((select count(*) from public.profiles) = 1, 'learner sees only their own profile');
select t.ok(not public.is_admin(), 'learner is not admin');
select t.fails($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied|roles can only', 'learner cannot change their role');
select t.fails($$update public.profiles set status = 'suspended' where id = auth.uid()$$, 'cannot change account status', 'learner cannot change account status');
select t.fails($$update public.profiles set student_id = 'X' where id = auth.uid()$$, 'permission denied', 'learner cannot change student ID');
update public.profiles set full_name = 'Aiko Tanaka' where id = auth.uid();
select t.ok((select full_name from public.profiles where id = auth.uid()) = 'Aiko Tanaka', 'learner can edit own name');
update public.profiles set full_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
select t.ok(true, 'update of another profile affects nothing (checked below)');
select t.fails($$select public.promote_to_owner('aiko@example.com')$$, 'permission denied', 'learner cannot call promote_to_owner');
select t.fails($$select public.admin_overview()$$, 'owner access required', 'learner cannot call admin_overview');
select t.fails($$select * from public.admin_students()$$, 'owner access required', 'learner cannot list students');
select t.fails($$select public.admin_student_report('22222222-2222-2222-2222-222222222222')$$, 'owner access required', 'learner cannot open another student report');
select t.fails($$select public.record_writing_attempt(auth.uid(), (select id from public.characters limit 1), gen_random_uuid(), 'free', '[[[1,1]]]', 100, '[]')$$,
  'permission denied', 'learner cannot write an official writing score directly');
select t.fails($$insert into public.quiz_attempts (user_id, quiz_id, client_attempt_id, answers, score, total) values (auth.uid(), null, gen_random_uuid(), '{}', 10, 10)$$,
  'permission denied', 'learner cannot insert quiz scores directly');
select t.fails($$insert into public.lessons (slug, module, title) values ('evil', 'greetings', 'x')$$, 'row-level security|permission denied', 'learner cannot create lessons');
select t.ok((select count(*) from public.admin_audit_logs) = 0, 'learner cannot read audit logs');
select t.fails($$insert into storage.objects (bucket_id, name) values ('media', 'videos/x.mp4')$$, 'row-level security', 'learner cannot upload media');

-- Published content is readable; quiz answer keys are not
select t.ok((select count(*) from public.characters where script = 'hiragana') = 46, 'learner reads 46 hiragana');
select t.ok((select count(*) from public.characters where script = 'katakana') = 46, 'learner reads 46 katakana');
select t.ok((select count(*) from public.lessons) = 4, 'learner reads published lessons');
select t.ok((select count(*) from public.quizzes) = 0, 'learner cannot read quizzes table (answer keys)');
select t.ok((select count(*) from public.list_quizzes()) = 3, 'learner can list published quizzes');
select t.ok(public.get_quiz((select id from public.list_quizzes() where slug = 'greetings-quiz'))::text !~ '"answer"', 'get_quiz strips the answer key');

-- ==========================================================
-- 3. Server-graded quiz, idempotent
-- ==========================================================
select t.ok((public.submit_quiz((select id from public.list_quizzes() where slug = 'greetings-quiz'), '[1,2,0,1,0,1]', 'aaaaaaaa-0000-0000-0000-000000000001') ->> 'score')::int = 6, 'all-correct quiz scores 6/6 on the server');
select t.ok((public.submit_quiz((select id from public.list_quizzes() where slug = 'greetings-quiz'), '[0,0,0,0,0,0]', 'aaaaaaaa-0000-0000-0000-000000000002') ->> 'score')::int = 2, 'partially wrong quiz scores 2/6');
select t.ok((public.submit_quiz((select id from public.list_quizzes() where slug = 'greetings-quiz'), '[0,0,0,0,0,0]', 'aaaaaaaa-0000-0000-0000-000000000002') ->> 'duplicate')::boolean, 'resubmitting the same attempt id is deduplicated');
select t.ok((select count(*) from public.quiz_attempts) = 2, 'exactly two attempts stored');
select t.fails($$select public.submit_quiz((select id from public.list_quizzes() where slug = 'greetings-quiz'), '[1]', gen_random_uuid())$$, 'answer every question', 'incomplete answer sets are rejected');

-- ==========================================================
-- 4. Character progress and mastery
-- ==========================================================
select public.record_character_view((select id from public.characters where char = 'あ'));
select public.record_character_view((select id from public.characters where char = 'あ'));
select t.ok((select count(*) from public.student_character_progress) = 1, 'repeated views create one progress row (no duplicates)');
select t.ok((public.submit_character_quiz((select id from public.characters where char = 'あ'), 'i', 'aaaaaaaa-0000-0000-0000-000000000010') ->> 'correct')::boolean = false, 'wrong romaji graded incorrect');
select t.ok((public.submit_character_quiz((select id from public.characters where char = 'あ'), 'a', 'aaaaaaaa-0000-0000-0000-000000000011') ->> 'correct')::boolean, 'correct romaji graded correct');
select t.ok(not (select mastered from public.student_character_progress), 'not mastered before writing practice');
reset role;
select public.record_writing_attempt(:'A', (select id from public.characters where char = 'あ'), 'aaaaaaaa-0000-0000-0000-000000000020', 'free', '[[[1,1],[2,2]]]', 82, '[]');
select public.record_writing_attempt(:'A', (select id from public.characters where char = 'あ'), 'aaaaaaaa-0000-0000-0000-000000000020', 'free', '[[[1,1],[2,2]]]', 82, '[]');
select t.ok((select count(*) from public.writing_attempts) = 1, 'duplicate writing submission stored once');
select t.ok((select mastered from public.student_character_progress where user_id = :'A'), 'character mastered after view + correct quiz + 70%+ writing');
select t.ok((select best_writing_accuracy from public.student_character_progress where user_id = :'A') = 82, 'best writing accuracy recorded');

-- ==========================================================
-- 5. Lessons only move forward
-- ==========================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select public.record_lesson_progress((select id from public.lessons where slug = 'basic-greetings'), 60);
select public.record_lesson_progress((select id from public.lessons where slug = 'basic-greetings'), 20);
select t.ok((select progress_pct from public.student_lesson_progress) = 60, 'lesson progress never goes backwards');
select public.record_lesson_progress((select id from public.lessons where slug = 'basic-greetings'), 100);
select t.ok((select completed from public.student_lesson_progress), 'lesson completes at 100%');
select t.ok((select count(*) from public.activity_logs where event_type = 'lesson_complete') = 1, 'lesson completion logged once');

-- ==========================================================
-- 6. Active learning time: sessions + heartbeats
-- ==========================================================
select public.record_login('Asia/Kolkata');
select t.ok((select timezone from public.profiles where id = auth.uid()) = 'Asia/Kolkata', 'timezone stored at login');
select public.record_login('Not/AZone');
reset role;
select t.ok((select timezone from public.profiles where id = :'A') = 'Asia/Kolkata', 'invalid timezone left the stored one unchanged');
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select set_config('t.sid', public.start_session('tab-aaaa-0001', 'test-agent')::text, false);
select t.ok(public.start_session('tab-aaaa-0001', 'test-agent')::text = current_setting('t.sid'), 'same tab reconnecting reuses its session (no duplicate)');
select t.ok(((public.heartbeat(current_setting('t.sid')::uuid)) ->> 'credited')::int = 0, 'heartbeat flood within 5 s earns nothing');
reset role;
update public.learning_sessions set last_heartbeat_at = now() - interval '30 seconds' where id = current_setting('t.sid')::uuid;
set role authenticated;
select t.ok(((public.heartbeat(current_setting('t.sid')::uuid)) ->> 'credited')::int = 30, 'active heartbeat after 30 s credits 30 s');
reset role;
update public.learning_sessions set last_heartbeat_at = now() - interval '70 seconds' where id = current_setting('t.sid')::uuid;
set role authenticated;
select t.ok(((public.heartbeat(current_setting('t.sid')::uuid)) ->> 'credited')::int = 40, 'late heartbeat credit is capped at 40 s');
reset role;
update public.learning_sessions set last_heartbeat_at = now() - interval '100 seconds' where id = current_setting('t.sid')::uuid;
set role authenticated;
select t.ok(((public.heartbeat(current_setting('t.sid')::uuid)) ->> 'credited')::int = 0, 'idle gap over 90 s credits nothing');
select t.ok((select active_seconds from public.learning_sessions where id = current_setting('t.sid')::uuid) = 70, 'session active time = 30 + 40 + 0');
select t.ok((select sum(seconds) from public.learning_time_daily) = 70, 'daily rollup matches session time');

-- A second device supersedes the first
select set_config('t.sid2', public.start_session('tab-bbbb-0002', 'phone')::text, false);
select t.ok((select end_reason from public.learning_sessions where id = current_setting('t.sid')::uuid) = 'superseded', 'new device supersedes old open session');
select t.ok((public.heartbeat(current_setting('t.sid')::uuid) ->> 'status') = 'ended', 'old tab is told its session ended');
select t.ok((select count(*) from public.learning_sessions where ended_at is null) = 1, 'only one open session per learner');

-- Browser closed with no logout: session times out at its last heartbeat
reset role;
update public.learning_sessions set last_heartbeat_at = now() - interval '5 minutes' where id = current_setting('t.sid2')::uuid;
set role authenticated;
select set_config('t.sid3', public.start_session('tab-cccc-0003', 'laptop')::text, false);
select t.ok((select end_reason from public.learning_sessions where id = current_setting('t.sid2')::uuid) = 'timeout', 'abandoned session closed as timeout');
select t.ok((select ended_at = last_heartbeat_at from public.learning_sessions where id = current_setting('t.sid2')::uuid), 'timed-out session ends at its last heartbeat (idle tail not counted)');
reset role;
update public.learning_sessions set last_heartbeat_at = now() - interval '20 seconds' where id = current_setting('t.sid3')::uuid;
set role authenticated;
select public.end_session(current_setting('t.sid3')::uuid, 'logout');
select t.ok((select end_reason from public.learning_sessions where id = current_setting('t.sid3')::uuid) = 'logout', 'logout closes the session');
select t.ok((select active_seconds from public.learning_sessions where id = current_setting('t.sid3')::uuid) = 20, 'logout credits the final active interval');
select t.ok((select count(*) from public.activity_logs where event_type = 'logout') = 1, 'logout timestamp logged');
select t.ok((select count(*) from public.activity_logs where event_type = 'login') = 2, 'both login timestamps logged');

-- Dashboard
select t.ok((public.my_dashboard() -> 'stats' -> 'hiragana' ->> 'mastered')::int = 1, 'dashboard shows 1 hiragana mastered');
select t.ok((public.my_dashboard() -> 'stats' ->> 'total_seconds')::int = 90, 'dashboard total learning time = 90 s');
select t.ok((public.my_dashboard() -> 'stats' ->> 'streak_days')::int = 1, 'streak counts today (>= 60 s)');
select t.ok((public.my_dashboard() -> 'recommended' ->> 'char') = 'い', 'next recommended character is い');
select t.ok(jsonb_array_length(public.my_dashboard() -> 'daily') = 14, 'dashboard returns 14 days of study time');

-- ==========================================================
-- 7. Learner B is isolated from A
-- ==========================================================
select set_config('request.jwt.claim.sub', :'B', false);
select t.ok((select full_name from public.profiles) = 'Ben Learner', 'B sees only B (and A''s earlier write to B did nothing)');
select t.ok((select count(*) from public.student_character_progress) = 0, 'B cannot see A''s character progress');
select t.ok((select count(*) from public.quiz_attempts) = 0, 'B cannot see A''s quiz attempts');
select t.ok((select count(*) from public.writing_attempts) = 0, 'B cannot see A''s writing attempts');
select t.ok((select count(*) from public.learning_sessions) = 0, 'B cannot see A''s sessions');
select t.ok((select count(*) from public.activity_logs) = 0, 'B cannot see A''s activity');
select t.ok((select count(*) from public.learning_time_daily) = 0, 'B cannot see A''s learning time');
select t.ok((public.heartbeat(current_setting('t.sid3')::uuid) ->> 'status') = 'ended', 'B cannot heartbeat A''s session');
select t.ok((public.my_dashboard() -> 'stats' ->> 'total_seconds')::int = 0, 'B dashboard shows only B''s data');

-- ==========================================================
-- 8. Owner: sees everyone, manages content, Kanji gate enforced
-- ==========================================================
select set_config('request.jwt.claim.sub', :'O', false);
select t.ok(public.is_admin(), 'owner is admin');
select t.ok((select count(*) from public.profiles) = 3, 'owner sees all profiles');
select t.ok((select count(*) from public.quiz_attempts) = 4, 'owner sees all quiz attempts');
select t.ok((public.admin_overview() ->> 'total_students')::int = 2, 'overview counts 2 students (owner excluded)');
select t.ok((public.admin_overview() ->> 'completed_lessons')::int = 1, 'overview counts completed lessons');
select t.ok((select count(*) from public.admin_students()) = 2, 'student table lists 2 learners');
select t.ok((select count(*) from public.admin_students('aiko')) = 1, 'student search by name/email works');
select t.ok((select count(*) from public.admin_students('KB-')) = 2, 'student search by student ID works');
select t.ok(jsonb_array_length(public.admin_student_report(:'A') -> 'logins') = 2, 'student report includes login history');
select t.ok(jsonb_array_length(public.admin_student_report(:'A') -> 'logouts') = 2, 'student report includes logout + timeout history');
select t.ok(jsonb_array_length(public.admin_student_report(:'A') -> 'characters') = 92, 'student report covers all 92 characters');

-- No-Kanji validator
select t.ok(public.find_kanji('ひらがな カタカナ romaji') = '{}', 'kana and romaji pass');
select t.ok(public.find_kanji('日本語') @> '{日,本,語}', 'kanji detected');
select t.ok(public.find_kanji('ときどき 時々') @> '{々}', 'iteration mark 々 detected');
select t.ok(public.find_kanji('𠮷') = '{𠮷}', 'extension-B kanji detected');
insert into public.lessons (slug, module, title, content, status) values ('draft-kanji', 'greetings', 'Draft', '{"items":[{"jp":"日本"}]}', 'draft');
select t.ok(true, 'drafts may contain Kanji while being edited');
select t.fails($$update public.lessons set status = 'published' where slug = 'draft-kanji'$$, 'kanji is not allowed', 'publishing a lesson with Kanji is rejected');
select t.ok(t.error_detail($$update public.lessons set status = 'published' where slug = 'draft-kanji'$$) ~ 'content.items\[0\].jp: (日 本|本 日)', 'error names the exact field and characters');
select t.ok((select content::text from public.lessons where slug = 'draft-kanji') ~ '日本', 'invalid characters were not silently removed');
select t.fails($$insert into public.quizzes (slug, module, title, questions, status) values ('kq', 'greetings', 'Q', '[{"prompt":"x","choices":["私","b"],"answer":0}]', 'published')$$, 'kanji is not allowed', 'quiz answers with Kanji rejected');
select t.fails($$insert into public.quizzes (slug, module, title, questions, status) values ('kq2', 'greetings', 'Q', '[{"prompt":"x","choices":["a"],"answer":3}]', 'published')$$, 'valid answer index', 'malformed quiz rejected');
select t.fails($$insert into public.videos (title, category, teaching_style, storage_path, captions_vtt, status) values ('V', 'greetings', 'animated_teacher', 'videos/a.mp4', 'WEBVTT\n\n00:00.000 --> 00:01.000\n先生', 'published')$$, 'kanji is not allowed', 'video captions with Kanji rejected');
select t.fails($$insert into public.videos (title, description, category, teaching_style, storage_path, status) values ('V', '学生', 'greetings', 'animated_teacher', 'videos/a.mp4', 'published')$$, 'kanji is not allowed', 'video description with Kanji rejected');
select t.fails($$insert into public.videos (title, category, teaching_style, status) values ('Empty', 'greetings', 'animated_teacher', 'published')$$, 'videos_published_has_media', 'a video without real media cannot be published');
select t.fails($$update public.characters set example_meaning = '水' where char = 'み'$$, 'kanji is not allowed', 'character examples with Kanji rejected');
select t.fails($$insert into public.characters (script, char, romaji, row_label, sort_order, stroke_count, stroke_paths, stroke_points) values ('hiragana', '山', 'ya', 'x', 99, 1, '[]', '[]')$$, 'kanji is not allowed', 'a Kanji cannot be added as a character');
insert into public.lessons (slug, module, title, summary, content, status) values ('extra-greet', 'greetings', 'More Greetings', 'ok', '{"items":[{"jp":"またね","romaji":"mata ne","en":"See you"}]}', 'published');
select t.ok((select status from public.lessons where slug = 'extra-greet') = 'published', 'clean kana lesson publishes');
update public.profiles set status = 'suspended' where id = :'B';
select t.fails($$update public.profiles set status = 'suspended' where id = auth.uid()$$, 'cannot suspend itself', 'owner cannot lock themselves out');
select t.ok((select count(*) from public.admin_audit_logs where action in ('insert', 'update')) >= 3, 'owner actions are written to the audit log');
select t.fails($$delete from public.admin_audit_logs$$, 'permission denied', 'audit log cannot be deleted from the app');

-- Suspended learner is locked out
select set_config('request.jwt.claim.sub', :'B', false);
select t.fails($$select public.my_dashboard()$$, 'not active', 'suspended learner cannot use the app');
select t.ok((select count(*) from public.characters) = 0, 'suspended learner cannot read content');

-- ==========================================================
-- 9. Anonymous visitors
-- ==========================================================
reset role;
set role anon;
select t.fails($$select count(*) from public.profiles$$, 'permission denied', 'anonymous users cannot read profiles');
select t.fails($$select count(*) from public.characters$$, 'permission denied', 'anonymous users cannot read content tables');
reset role;
