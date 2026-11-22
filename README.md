# KanaBloom 🌸

**Learn Japanese. One Character at a Time.**

KanaBloom is a free web app for learning Japanese as a beginner. It teaches hiragana, katakana, greetings, self-introduction and basic business vocabulary, with no Kanji anywhere. It includes stroke-order animation, a writing canvas that works with mouse, touch or stylus and is scored on the server, server-graded quizzes, a video centre, tracking of real active study time, and a separate private dashboard for the owner.

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 (Vite), installable as a PWA.
- **Backend:** Supabase: PostgreSQL with Row Level Security, Auth, Storage and Edge Functions (Deno).
- **Cost to learners:** nothing. There are no payments, subscriptions or paywalls.

---

## 1. What's in the box

```
src/                      React app
  pages/                  Home, Auth, Dashboard, KanaModule, PhraseModule, WritingStudio, Videos, Profile
  pages/admin/            Owner dashboard: Overview, Students + reports, Lessons, Quizzes, Videos, Characters, Audit log
  components/             UI kit, StrokeOrder animation, WritingCanvas, Quiz, AudioButton
  lib/activityTracker.ts  Client side of active-time tracking (heartbeats, idle detection)
  content/                Course source content (kana, lessons, quizzes) + KanjiVG stroke data
supabase/
  migrations/             Schema, server functions, RLS + grants, storage bucket
  seed.sql                GENERATED: 92 kana with stroke data, 4 lessons, 3 quizzes
  functions/              Edge functions: score-writing, admin-users, generate-video, video-webhook
  functions/_shared/      kanji.ts and strokes.ts, shared by the browser and the server
  tests/                  Database test suite (110 checks) + local runner
scripts/                  create-owner.mjs, gen-seed.ts, extract-kanjivg.ts
tests/                    Vitest unit tests
```

### Database tables

The 13 required tables are `profiles`, `lessons`, `characters`, `student_lesson_progress`, `student_character_progress`, `learning_sessions`, `activity_logs`, `videos`, `video_progress`, `quizzes`, `quiz_attempts`, `writing_attempts` and `admin_audit_logs`. There is one extra table, `learning_time_daily`, which holds a per-learner daily rollup of active seconds bucketed by the learner's local day. It powers streaks and the daily, weekly and monthly charts.

Every table has UUID keys, foreign keys, `created_at`/`updated_at` timestamps (stored as UTC `timestamptz`) and indexes. Unique constraints prevent duplicate progress rows, such as one row per learner per character.

---

## 2. Setup

### Prerequisites
- Node.js 20+.
- A Supabase project (the free tier is fine): https://supabase.com.
- The Supabase CLI (`npm i -g supabase`) for migrations and edge functions.

### Step 1: Install
```bash
npm install
cp .env.example .env
```

### Step 2: Environment variables

| Variable | Where it's used | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser | No |
| `VITE_SUPABASE_ANON_KEY` | Browser | No. It's public by design and RLS protects the data |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `scripts/create-owner.mjs` only, on your machine | **Yes. Never prefix with `VITE_`, never commit, never deploy to the frontend** |
| `OWNER_EMAIL`, `OWNER_NAME`, `OWNER_PASSWORD` | `create-owner.mjs` | Password: yes |

Find these under Supabase Dashboard → Project Settings → API. Edge functions receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically from Supabase.

### Step 3: Create the database
```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push                       # applies supabase/migrations/*
psql "$YOUR_DB_CONNECTION_STRING" -f supabase/seed.sql
```
Alternatively, paste each migration file in order into the SQL Editor, then paste `seed.sql`.

### Step 4: Configure Auth (Dashboard → Authentication)
- **Email provider:** enable it and turn **Confirm email** ON. This is the email verification step.
- **URL Configuration:** set Site URL to your app URL. Add `https://YOUR-APP/login` and `https://YOUR-APP/reset-password` to Redirect URLs (plus the `http://localhost:5173/...` versions for development).
- **Production email:** set up custom SMTP. Supabase's built-in email sender is heavily rate-limited.

### Step 5: Deploy the edge functions
```bash
supabase functions deploy score-writing
supabase functions deploy admin-users
supabase functions deploy generate-video
supabase functions deploy video-webhook --no-verify-jwt   # authenticated by a shared secret instead
supabase secrets set APP_ORIGIN=https://YOUR-APP-DOMAIN   # restricts CORS (optional, defaults to *)
```
`score-writing` is required: without it, writing attempts can't be saved. Learners still see a preview score, labelled "not saved".

### Step 6: Create the owner account (server-side, once)
```bash
npm run create-owner
```
This uses the service-role key **on your machine** to create a confirmed user and call `promote_to_owner()`. That function can only be executed by the service role. Anonymous and logged-in users can't call it, so public sign-up can never create an owner. The database allows **exactly one** owner (a unique partial index enforces this). You can also run it in the SQL editor:
```sql
select public.promote_to_owner('owner@example.com');   -- after that user has signed up
```
Log in with the owner email and you'll land on `/admin`.

### Step 7: Run locally
```bash
npm run dev            # http://localhost:5173
```

---

## 3. Deployment

`npm run build` produces a static site in `dist/`. Host it on Vercel, Netlify, Cloudflare Pages, Firebase Hosting or similar:
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time environment variables.
- Configure an SPA fallback (all routes → `/index.html`). On Netlify, add a `_redirects` file containing `/* /index.html 200`. On Vercel, add a rewrite to `/`.
- Serve over HTTPS. This is required for the PWA install and the service worker.

The PWA files are `public/manifest.webmanifest` and `public/sw.js`. The service worker caches only the app shell and static assets. It **never** caches Supabase calls, so progress always goes to the server.

---

## 4. How the key requirements are met

### Two roles, enforced by the database
- `handle_new_user()` always creates `role = 'learner'` and ignores any role sent in sign-up metadata.
- Row Level Security is enabled on every table. Learners can **read only their own rows**. They have **no direct INSERT or UPDATE** on any progress or score table. Every learner write goes through a `SECURITY DEFINER` function that validates the request and grades on the server: `submit_quiz`, `submit_character_quiz`, `record_lesson_progress`, `record_video_progress`, `heartbeat` and others.
- Quiz answer keys never reach learners. They can't read the `quizzes` table, and `get_quiz()` strips the answers.
- Writing scores are computed in the `score-writing` edge function. Only the service role can call `record_writing_attempt`.
- A `guard_profile_update` trigger blocks changes to role, status, student ID and email unless the caller is the owner or the server.
- Admin analytics functions call `require_admin()`. Route guards in React are only a convenience.
- The owner can't suspend or delete their own account. The audit log is append-only from the app.

### No Kanji, enforced twice
- `supabase/functions/_shared/kanji.ts` gives live validation in the owner's editors. It lists the exact field paths and characters, for example `content.items[2].example.jp: 日 本`.
- Database triggers (`find_kanji`, `assert_no_kanji`) **reject** publishing any lesson, quiz, video (title, description, captions, generation script) or character containing CJK ideographs or Kanji marks (々 〆 〇, Extensions A–G, compatibility and radicals). Nothing is ever silently stripped. Drafts may contain Kanji while being edited, but they can't be published.
- `scripts/gen-seed.ts` refuses to generate seed data if any course content contains Kanji.

### Active learning time
- The browser sends a heartbeat every 30 seconds **only** while the tab is visible and the learner has interacted (pointer, key, scroll or touch, or a playing video) within the last 60 seconds. Idle time produces no heartbeats.
- The server credits the real elapsed time since the last heartbeat, **capped at 40 seconds**. A gap over 90 seconds earns nothing. Heartbeats less than 5 seconds apart are ignored.
- A session with no heartbeat for 2 minutes is closed as `timeout` **at its last heartbeat**. This handles closed browsers, crashes and sleeping laptops.
- Each learner can have only one open session (a unique partial index). Web Locks ensure only one tab per browser tracks time. A reloaded tab resumes its own session, and a new device supersedes the old session.
- Logging out ends the session and records a logout event. Closing the page sends a `keepalive` `end_session`.
- Timestamps are stored in UTC and displayed in the viewer's local timezone. Daily buckets use the learner's own timezone, which the browser reports at login.

### Mastery
A character is **mastered** when the learner has studied it, answered its recognition quiz correctly at least once, and written it with ≥ 70% accuracy.

### Audio
If the owner uploads a recording (Admin → Characters & audio), that recording plays. Otherwise the app uses the device's built-in Japanese voice (Web Speech API), and the interface shows "device voice". Desktop Chrome, Edge and Safari and most phones have a Japanese voice. Some Linux browsers don't, and the app says so instead of failing silently.

### Videos and AI generation
- No placeholder or fake videos are shipped. The database refuses to publish a video without real media (`videos_published_has_media`).
- **Manual path (works out of the box):** generate a video with any tool, then upload it in Admin → Videos with captions (WebVTT) and a thumbnail. Captions are checked for Kanji.
- **Automated path (optional):** `generate-video` is provider-neutral. Configure it with:
  ```bash
  supabase secrets set VIDEO_PROVIDER=heygen VIDEO_PROVIDER_URL=https://... VIDEO_PROVIDER_API_KEY=... VIDEO_WEBHOOK_SECRET=<random>
  ```
  It POSTs `{external_id, title, script, style, language, callback_url, callback_secret}` to `VIDEO_PROVIDER_URL`. Commercial providers (HeyGen, Synthesia, D-ID and others) each have their own API format, so in practice `VIDEO_PROVIDER_URL` points to a small adapter you host. The adapter translates the request for your provider and calls `video-webhook` (header `x-webhook-secret`) with `{external_id, state: "ready", video_url, duration_seconds, captions_vtt}`. The video stays a **draft** until you review and publish it. **I have not tested this against any real provider.**

### Stroke data licence
Stroke paths come from **KanjiVG** © Ulrich Apel, licensed under **CC BY-SA 3.0** (https://kanjivg.tagaini.net). Attribution appears in the footer. To refresh the data, run `npx tsx scripts/extract-kanjivg.ts /path/to/kanjivg/kanji` and then `npm run gen:seed`.

---

## 5. Testing

```bash
npm test            # Vitest: 43 unit tests
npm run test:db     # PostgreSQL: 110 database tests (needs PostgreSQL 15+ binaries locally)
npm run test:functions   # Deno: 14 edge-function checks against a mock Supabase API (needs Deno)
npm run typecheck && npm run build
```

| Area | What's covered | How |
|---|---|---|
| Registration | Learner role forced, student ID format and uniqueness, timestamp | DB tests |
| Admin permissions | Single owner, owner sees all, analytics, search, reports, audit, can't lock self out | DB tests |
| Learner permissions | Can't change role or status, can't call admin functions, can't write scores, lessons or media, can't read answer keys | DB tests |
| Data isolation | Learner B sees none of A's progress, attempts, sessions, activity or time | DB tests |
| Progress tracking | Idempotent quiz and writing submissions, mastery rule, lessons only move forward | DB tests |
| Learning time | 30 s credit, 40 s cap, idle gap, flood guard, supersede, timeout at last heartbeat, logout credit, daily rollup, streak | DB + unit tests |
| No-Kanji | Field-path reports, no silent removal, lessons, quizzes, captions, descriptions, characters; all shipped content | DB + unit tests |
| Writing | Correct, shaky, off-centre and small writing passes; reversed, missing, extra, similar-looking (お vs あ) and scribbled strokes fail; payload validation | Unit + function tests |
| Edge functions | Auth, role checks, server-side scoring ignores client-claimed scores, webhook secret, no fake videos | Deno tests |
| UI | Every learner and admin page rendered in Chromium (desktop and mobile) with no console errors; writing canvas drawn with a mouse end to end | Playwright, run during development |

**Not tested in this build:** a live Supabase project (real Auth emails, Storage uploads, deployed functions), real AI video providers, and audio playback on physical devices. The database tests run the real migrations on plain PostgreSQL 16, with minimal stand-ins for Supabase's `auth` and `storage` schemas (`supabase/tests/supabase_stub.sql`). Run through the checklist below on your project before launch.

### Pre-launch checklist
1. Register → receive the verification email → verify → log in → dashboard shows your student ID.
2. In a second browser, register another learner. Confirm neither can see the other's data.
3. Study a character, pass its quiz, write it at 70%+ → it shows as mastered ✿.
4. Leave the tab idle for 5 minutes → learning time doesn't increase.
5. As the owner: publish a lesson containing 日本 → it's rejected with the field path. Fix it → it publishes.
6. Upload a video with captions → publish → a learner watches it, leaves, returns → playback resumes.
7. Export the student CSV and an individual report CSV.

---

## 6. Backups and operations
- **Backups:** Supabase Pro includes daily backups and point-in-time recovery. On the free tier, schedule your own: `supabase db dump -f backup-$(date +%F).sql` (schema + data), for example nightly via cron or a GitHub Action. Store dumps encrypted, off-site.
- **Storage:** back up the `media` bucket separately (Storage → download, or the Storage API).
- **Session cleanup:** stale sessions close automatically on the learner's next visit. To close them on a schedule too, enable `pg_cron` and run:
  `select cron.schedule('close-stale', '*/5 * * * *', $$select public.close_stale_sessions()$$);`
- **Secrets:** rotate the service-role key if it's ever exposed. It must never appear in frontend code. A unit test checks the main browser files for it.
