-- KanaBloom access control: Row Level Security on every table + least-privilege grants.
-- Principle: learners READ their own rows; every learner WRITE goes through a
-- SECURITY DEFINER function that validates and grades on the server.
-- The owner (role = 'admin') can read everything and manage content and accounts.

alter table public.profiles                   enable row level security;
alter table public.lessons                    enable row level security;
alter table public.characters                 enable row level security;
alter table public.student_lesson_progress    enable row level security;
alter table public.student_character_progress enable row level security;
alter table public.learning_sessions          enable row level security;
alter table public.learning_time_daily        enable row level security;
alter table public.activity_logs              enable row level security;
alter table public.videos                     enable row level security;
alter table public.video_progress             enable row level security;
alter table public.quizzes                    enable row level security;
alter table public.quiz_attempts              enable row level security;
alter table public.writing_attempts           enable row level security;
alter table public.admin_audit_logs           enable row level security;

-- ---------- Grants: start from nothing ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (full_name, timezone, status) on public.profiles to authenticated;   -- column-limited; guard trigger enforces who
grant delete on public.profiles to authenticated;                                  -- RLS: owner only
grant insert, update, delete on public.lessons, public.characters, public.videos, public.quizzes to authenticated; -- RLS: owner only

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (public.is_admin() and id <> auth.uid() and role = 'learner');

-- ---------- published content: lessons, characters, videos ----------
create policy lessons_select on public.lessons for select to authenticated
  using ((status = 'published' and public.is_active_user()) or public.is_admin());
create policy lessons_write on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy characters_select on public.characters for select to authenticated
  using ((status = 'published' and public.is_active_user()) or public.is_admin());
create policy characters_write on public.characters for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy videos_select on public.videos for select to authenticated
  using ((status = 'published' and public.is_active_user()) or public.is_admin());
create policy videos_write on public.videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Quizzes contain answer keys: learners never read the table; they use get_quiz()/list_quizzes().
create policy quizzes_admin on public.quizzes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- per-learner records: own rows or owner; no direct writes ----------
create policy slp_select on public.student_lesson_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy scp_select on public.student_character_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy ls_select on public.learning_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy ltd_select on public.learning_time_daily for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy al_select on public.activity_logs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy vp_select on public.video_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy qa_select on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy wa_select on public.writing_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- audit log: owner read-only; written only by triggers ----------
create policy audit_select on public.admin_audit_logs for select to authenticated
  using (public.is_admin());

-- ---------- Function grants ----------
-- Learner-callable (each checks auth.uid() / active status itself)
grant execute on function
  public.is_admin(), public.is_active_user(),
  public.find_kanji(text), public.find_kanji_json(jsonb, text), public.assert_no_kanji(text, jsonb),
  public.record_login(text), public.start_session(text, text), public.heartbeat(uuid), public.end_session(uuid, text),
  public.get_quiz(uuid), public.list_quizzes(), public.submit_quiz(uuid, jsonb, uuid),
  public.record_character_view(uuid), public.submit_character_quiz(uuid, text, uuid),
  public.record_lesson_progress(uuid, int), public.record_video_progress(uuid, numeric, numeric),
  public.my_dashboard()
to authenticated;
-- Owner analytics (each calls require_admin())
grant execute on function public.admin_overview(), public.admin_students(text, int, int), public.admin_student_report(uuid)
to authenticated;
-- Server-only: edge functions (service role) and SQL editor
grant execute on function public.record_writing_attempt(uuid, uuid, uuid, text, jsonb, int, jsonb), public.close_stale_sessions(uuid),
  public.promote_to_owner(text)
to service_role;
-- user_stats, log_event, credit_time, refresh_mastery: not granted to any client role.
-- promote_to_owner: service role only (scripts/create-owner.mjs) — never anon/authenticated.

-- Make sure future functions are not executable by clients unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
