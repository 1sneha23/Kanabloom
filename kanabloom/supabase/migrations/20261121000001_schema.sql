-- KanaBloom schema: tables, constraints, indexes.
-- All timestamps are timestamptz (stored in UTC). All ids are UUIDs.

create extension if not exists pgcrypto;

-- ---------- Enumerated types ----------
create type public.user_role      as enum ('admin', 'learner');
create type public.account_status as enum ('active', 'suspended');
create type public.content_status as enum ('draft', 'published');
create type public.module_type    as enum ('hiragana', 'katakana', 'greetings', 'self_intro', 'business', 'writing');
create type public.script_type    as enum ('hiragana', 'katakana');
create type public.video_style    as enum ('animated_teacher', 'ai_human_teacher', 'animated_characters');
create type public.video_source   as enum ('upload', 'ai_generated', 'external');

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- 1. profiles ----------
create sequence public.student_number_seq start 1;

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  student_id       text not null unique,
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 100),
  email            text not null,
  role             public.user_role not null default 'learner',
  status           public.account_status not null default 'active',
  timezone         text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  registered_at    timestamptz not null default now(),
  last_login_at    timestamptz,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Exactly one owner account may exist.
create unique index profiles_single_owner on public.profiles (role) where role = 'admin';
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_last_activity_idx on public.profiles (last_activity_at desc);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- 2. lessons ----------
create table public.lessons (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  module       public.module_type not null,
  title        text not null check (char_length(title) between 1 and 200),
  summary      text not null default '',
  content      jsonb not null default '{}'::jsonb,
  audio_path   text,
  sort_order   int not null default 0,
  status       public.content_status not null default 'draft',
  published_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module, sort_order) where status = 'published';
create trigger lessons_updated_at before update on public.lessons for each row execute function public.set_updated_at();

-- ---------- 3. characters ----------
create table public.characters (
  id              uuid primary key default gen_random_uuid(),
  script          public.script_type not null,
  char            text not null check (char_length(char) = 1),
  romaji          text not null check (romaji ~ '^[a-z]{1,4}$'),
  row_label       text not null,
  sort_order      int not null,
  pronunciation   text not null default '',
  example_word    text not null default '',
  example_romaji  text not null default '',
  example_meaning text not null default '',
  stroke_count    int not null check (stroke_count between 1 and 10),
  stroke_paths    jsonb not null,   -- SVG path data per stroke (KanjiVG, CC BY-SA 3.0), used for animation
  stroke_points   jsonb not null,   -- resampled points per stroke, used for scoring
  audio_path      text,
  status          public.content_status not null default 'published',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (script, char),
  unique (script, sort_order)
);
create trigger characters_updated_at before update on public.characters for each row execute function public.set_updated_at();

-- ---------- 4. student_lesson_progress ----------
create table public.student_lesson_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  lesson_id      uuid not null references public.lessons (id) on delete cascade,
  progress_pct   int not null default 0 check (progress_pct between 0 and 100),
  completed      boolean not null default false,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  last_viewed_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create index slp_lesson_idx on public.student_lesson_progress (lesson_id);
create trigger slp_updated_at before update on public.student_lesson_progress for each row execute function public.set_updated_at();

-- ---------- 5. student_character_progress ----------
create table public.student_character_progress (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  character_id          uuid not null references public.characters (id) on delete cascade,
  first_viewed_at       timestamptz,
  quiz_attempts         int not null default 0,
  quiz_correct          int not null default 0,
  writing_attempts      int not null default 0,
  best_writing_accuracy int not null default 0 check (best_writing_accuracy between 0 and 100),
  mastered              boolean not null default false,
  mastered_at           timestamptz,
  last_practiced_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, character_id)
);
create index scp_character_idx on public.student_character_progress (character_id);
create trigger scp_updated_at before update on public.student_character_progress for each row execute function public.set_updated_at();

-- ---------- 6. learning_sessions ----------
create table public.learning_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  client_id         text not null check (char_length(client_id) between 8 and 64),
  user_agent        text,
  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text check (end_reason in ('logout', 'timeout', 'superseded', 'closed')),
  active_seconds    int not null default 0 check (active_seconds >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- One open session per learner: prevents duplicate concurrent sessions.
create unique index learning_sessions_one_open on public.learning_sessions (user_id) where ended_at is null;
create index learning_sessions_user_started_idx on public.learning_sessions (user_id, started_at desc);
create trigger ls_updated_at before update on public.learning_sessions for each row execute function public.set_updated_at();

-- Daily rollup of active learning seconds, bucketed by the learner's local day.
create table public.learning_time_daily (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  seconds    int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------- 7. activity_logs ----------
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event_type  text not null check (event_type in (
                'login', 'logout', 'session_timeout', 'lesson_view', 'lesson_complete',
                'character_view', 'character_quiz', 'character_mastered', 'quiz_attempt',
                'writing_attempt', 'video_progress', 'video_complete')),
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_user_created_idx on public.activity_logs (user_id, created_at desc);
create index activity_logs_type_idx on public.activity_logs (event_type, created_at desc);

-- ---------- 8. videos ----------
create table public.videos (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '',
  category         public.module_type not null,
  teaching_style   public.video_style not null,
  source           public.video_source not null default 'upload',
  storage_path     text,             -- object path in the private "media" bucket
  external_url     text check (external_url is null or external_url ~ '^https://'),
  thumbnail_path   text,
  captions_vtt     text not null default '',
  duration_seconds int check (duration_seconds is null or duration_seconds > 0),
  generation       jsonb not null default '{}'::jsonb,  -- provider, job id, state, script
  sort_order       int not null default 0,
  status           public.content_status not null default 'draft',
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A published video must have real media behind it. No placeholder videos.
  constraint videos_published_has_media check (status = 'draft' or storage_path is not null or external_url is not null)
);
create index videos_category_idx on public.videos (category, sort_order) where status = 'published';
create trigger videos_updated_at before update on public.videos for each row execute function public.set_updated_at();

-- ---------- 9. video_progress ----------
create table public.video_progress (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  video_id             uuid not null references public.videos (id) on delete cascade,
  position_seconds     numeric(10,2) not null default 0 check (position_seconds >= 0),
  max_position_seconds numeric(10,2) not null default 0 check (max_position_seconds >= 0),
  duration_seconds     numeric(10,2),
  completed            boolean not null default false,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, video_id)
);
create index vp_video_idx on public.video_progress (video_id);
create trigger vp_updated_at before update on public.video_progress for each row execute function public.set_updated_at();

-- ---------- 10. quizzes ----------
create table public.quizzes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  module     public.module_type not null,
  lesson_id  uuid references public.lessons (id) on delete set null,
  title      text not null check (char_length(title) between 1 and 200),
  -- [{prompt, choices[], answer:int, explanation?}] — answers never leave the server for learners.
  questions  jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  status     public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_module_idx on public.quizzes (module) where status = 'published';
create trigger quizzes_updated_at before update on public.quizzes for each row execute function public.set_updated_at();

-- ---------- 11. quiz_attempts ----------
create table public.quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  quiz_id           uuid references public.quizzes (id) on delete cascade,
  character_id      uuid references public.characters (id) on delete cascade,
  client_attempt_id uuid not null,   -- idempotency key generated by the client
  answers           jsonb not null,
  score             int not null check (score >= 0),
  total             int not null check (total > 0 and score <= total),
  percent           numeric(5,2) generated always as (round(score * 100.0 / total, 2)) stored,
  created_at        timestamptz not null default now(),
  unique (user_id, client_attempt_id),
  constraint quiz_attempt_target check (quiz_id is not null or character_id is not null)
);
create index qa_user_created_idx on public.quiz_attempts (user_id, created_at desc);
create index qa_quiz_idx on public.quiz_attempts (quiz_id);

-- ---------- 12. writing_attempts ----------
create table public.writing_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  character_id      uuid not null references public.characters (id) on delete cascade,
  client_attempt_id uuid not null,
  mode              text not null check (mode in ('trace', 'free')),
  strokes           jsonb not null,
  stroke_count      int not null,
  accuracy          int not null check (accuracy between 0 and 100),
  feedback          jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);
create index wa_user_created_idx on public.writing_attempts (user_id, created_at desc);
create index wa_character_idx on public.writing_attempts (character_id);

-- ---------- 13. admin_audit_logs ----------
create table public.admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_created_idx on public.admin_audit_logs (created_at desc);
