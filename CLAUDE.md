# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KanaBloom** is a free educational web app for learning Japanese (hiragana/katakana, greetings, business Japanese, writing practice). It's a React SPA backed by Supabase (PostgreSQL + Auth + Storage + Deno Edge Functions).

## Commands

```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # TypeScript compile + Vite build → dist/
npm run typecheck    # Type-check without emitting
npm test             # 43 Vitest unit tests
npm run test:db      # 110 PostgreSQL security tests (requires PG 15+)
npm run test:functions  # 14 Deno edge function tests
npm run gen:seed     # Regenerate supabase/seed.sql from src/content/kana.ts
npm run create-owner # One-time owner account setup (server-side)
```

To run a single Vitest test file:
```bash
npx vitest run tests/strokes.test.ts
```

## Architecture

### Frontend (`src/`)

- **`App.tsx`** — Root router with 13 lazy-loaded routes split into public, learner, and admin areas.
- **`auth/AuthProvider.tsx`** — Auth state via React Context; manages sessions, activity tracking, and heartbeats.
- **`auth/Guards.tsx`** — `RequireLearner` / `RequireAdmin` route guards.
- **`pages/`** — One file per page; `admin/` subdirectory holds the 8 admin pages.
- **`components/WritingCanvas.tsx`** — Handwriting input using Pointer Events (mouse/touch/stylus), coordinates mapped to 109×109 KanjiVG space.
- **`components/StrokeOrder.tsx`** — Animated SVG stroke-order guide.
- **`lib/supabase.ts`** — Supabase client init and an `rpc()` wrapper for all PostgREST calls.
- **`lib/activityTracker.ts`** — Browser-side: marks "active" when tab visible + user input detected, sends heartbeats every 30 s.
- **`lib/strokes.ts`** / **`lib/kanji.ts`** — Copied from `supabase/functions/_shared/`; same validation logic runs in browser and on the server.
- **`content/kana.ts`** — All course content (kana table, lessons, quizzes). `gen:seed` converts this to SQL.
- **`hooks/useAsync.ts`** — Generic hook for async data loading.

### Backend (`supabase/`)

**Migrations (4 files, applied in order):**
1. `schema.sql` — 13 tables (profiles, lessons, characters, student progress, learning sessions, activity logs, videos, quizzes, writing attempts, audit log, etc.)
2. `functions.sql` — 20+ SECURITY DEFINER RPCs (heartbeat, submit_quiz, record_lesson_progress, admin_overview, etc.)
3. `security.sql` — RLS policies, triggers (no-kanji enforcement, timestamps)
4. `storage.sql` — `media` bucket

**Edge Functions (Deno, `supabase/functions/`):**
- `score-writing` — Receives stroke data, scores against reference, writes the official `writing_attempts` row.
- `admin-users` — User promotion, suspension, deletion (requires admin auth).
- `generate-video` — Provider-agnostic: initiates AI video generation (HeyGen/Synthesia/D-ID/etc.).
- `video-webhook` — Receives completion callback from video provider, updates `videos` table.
- `_shared/` — `kanji.ts`, `strokes.ts`, `http.ts` shared between all edge functions and mirrored into `src/lib/`.

### Data Flow

1. Browser calls **Supabase RPCs** (via `rpc()` wrapper) for all learner & admin operations.
2. **SECURITY DEFINER functions** are the only way to write learner data — RLS on its own doesn't allow direct table writes from the client.
3. Handwriting scoring: browser sends strokes to `score-writing` edge function; the edge function computes the official score and records it.
4. Learning time: browser `ActivityTracker` sends heartbeats → `heartbeat()` RPC credits elapsed time (capped at 40 s per heartbeat, idles after 60 s inactivity).

## Security Model

- **RLS on every table** — Learners are strictly isolated by `user_id`.
- **Defense in depth** — React route guards + RLS + SECURITY DEFINER RPCs + append-only audit log.
- **No-kanji enforcement** — `find_kanji` / `assert_no_kanji` functions run as DB triggers; the same regex is in `src/lib/kanji.ts` for instant browser feedback.
- **Score integrity** — Browser previews a client-side score, but the official score always comes from the server.
- **Idempotency** — `submit_quiz` and `record_lesson_progress` are idempotent; resubmitting won't create duplicate rows.
- **Owner protection** — Owner cannot suspend or delete their own account.

## Key Constraints

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are safe to expose (protected by RLS). `SUPABASE_SERVICE_ROLE_KEY` is server-only — never put it in `VITE_*` vars.
- Stroke/kanji validation code lives in `supabase/functions/_shared/` and must be kept in sync with `src/lib/strokes.ts` and `src/lib/kanji.ts`.
- KanjiVG stroke data (`src/content/kanji.ts`) is CC BY-SA 3.0 — attribution must remain in the footer.
- Published videos require real media: the `videos_published_has_media` DB constraint blocks publication without a URL.
- The service worker (`public/sw.js`) caches the app shell only — never caches Supabase API calls.
