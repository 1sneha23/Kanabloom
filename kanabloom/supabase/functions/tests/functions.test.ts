// Integration tests for the edge functions. Each function runs as a real Deno process
// against a mock Supabase API (auth + PostgREST), so request handling, authorisation and
// server-side scoring are exercised end to end — without a live Supabase project.
// Run: deno test -A supabase/functions/tests/functions.test.ts
function assert(cond: unknown, msg = 'assertion failed'): asserts cond { if (!cond) throw new Error(msg); }
function assertEquals(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
import strokes from '../../../src/content/kana-strokes.json' with { type: 'json' };
import { referenceFromPaths } from '../_shared/strokes.ts';

const MOCK_PORT = 54400;
const REF = referenceFromPaths((strokes as Record<string, string[]>)['あ']);
const CHAR_ID = '00000000-0000-4000-8000-000000000001';
const users: Record<string, { id: string; role: string; status: string }> = {
  'learner-token': { id: '00000000-0000-4000-8000-00000000000a', role: 'learner', status: 'active' },
  'admin-token': { id: '00000000-0000-4000-8000-00000000000b', role: 'admin', status: 'active' },
  'suspended-token': { id: '00000000-0000-4000-8000-00000000000c', role: 'learner', status: 'suspended' },
};
const rpcCalls: { fn: string; body: Record<string, unknown> }[] = [];
const videoUpdates: Record<string, unknown>[] = [];

function startMock() {
  return Deno.serve({ port: MOCK_PORT, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    const single = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') {
      const tok = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
      const u = users[tok];
      return u ? single({ id: u.id, aud: 'authenticated', email: `${u.role}@x.test` }) : new Response('{"msg":"bad jwt"}', { status: 401 });
    }
    if (url.pathname === '/rest/v1/profiles') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const u = Object.values(users).find((x) => x.id === id);
      return u ? single({ role: u.role, status: u.status }) : new Response('{}', { status: 406 });
    }
    if (url.pathname === '/rest/v1/characters') return single({ id: CHAR_ID, stroke_points: REF, status: 'published' });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const body = await req.json();
      rpcCalls.push({ fn: url.pathname.split('/').pop()!, body });
      return single({ attempt_id: 'att-1', accuracy: body.p_accuracy, duplicate: false });
    }
    if (url.pathname === '/rest/v1/videos') {
      if (req.method === 'PATCH') { const b = await req.json(); videoUpdates.push(b); return single({ id: 'v1', ...b }); }
      if (req.method === 'GET') return single({ id: 'v1', generation: { state: 'processing' }, captions_vtt: '' });
    }
    return new Response('not mocked: ' + url.pathname, { status: 500 });
  });
}

async function startFunction(name: string, port: number, env: Record<string, string> = {}) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', '--quiet', `supabase/functions/${name}/index.ts`],
    env: { SUPABASE_URL: `http://localhost:${MOCK_PORT}`, SUPABASE_SERVICE_ROLE_KEY: 'service-key-for-tests', PORT: String(port), DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, ...env },
    stdout: 'null', stderr: 'piped',
  });
  const child = cmd.spawn();
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}`, { method: 'OPTIONS' }).then((r) => r.body?.cancel()); return child; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error(`${name} did not start`);
}
const stop = async (c: Deno.ChildProcess) => { c.kill(); await c.stderr.cancel(); await c.status; };
const post = (port: number, body: unknown, token?: string, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

Deno.test('edge functions', async (t) => {
  const mock = startMock();
  try {
    const sw = await startFunction('score-writing', 54401);
    try {
      const good = { character_id: CHAR_ID, client_attempt_id: '00000000-0000-4000-8000-0000000000f1', mode: 'free', strokes: REF };
      await t.step('score-writing rejects anonymous callers', async () => { assertEquals((await post(54401, good)).status, 401); });
      await t.step('score-writing rejects suspended learners', async () => { assertEquals((await post(54401, good, 'suspended-token')).status, 403); });
      await t.step('score-writing rejects the owner (learner-only)', async () => { assertEquals((await post(54401, good, 'admin-token')).status, 403); });
      await t.step('score-writing validates payloads', async () => {
        assertEquals((await post(54401, { ...good, strokes: [[[1, 'x']]] }, 'learner-token')).status, 400);
        assertEquals((await post(54401, { ...good, mode: 'cheat' }, 'learner-token')).status, 400);
        assertEquals((await post(54401, { ...good, client_attempt_id: 'nope' }, 'learner-token')).status, 400);
      });
      await t.step('score-writing scores on the server and records the result for the caller only', async () => {
        rpcCalls.length = 0;
        const r = await post(54401, { ...good, p_user_id: 'someone-else', accuracy: 100 }, 'learner-token');
        assertEquals(r.status, 200);
        assert(r.body.accuracy >= 98, `expected high accuracy, got ${r.body.accuracy}`);
        assertEquals(rpcCalls[0].fn, 'record_writing_attempt');
        assertEquals(rpcCalls[0].body.p_user_id, users['learner-token'].id);
      });
      await t.step('a client-claimed score is ignored: scribbles score low', async () => {
        rpcCalls.length = 0;
        const r = await post(54401, { ...good, strokes: [[[5, 100], [6, 101]]], accuracy: 100 }, 'learner-token');
        assertEquals(r.status, 200);
        assert((rpcCalls[0].body.p_accuracy as number) < 20);
      });
    } finally { await stop(sw); }

    const gv = await startFunction('generate-video', 54402);
    try {
      await t.step('generate-video is owner-only', async () => { assertEquals((await post(54402, { title: 'x', script: 'y' }, 'learner-token')).status, 403); });
      await t.step('generate-video reports a missing provider instead of faking a video', async () => {
        const r = await post(54402, { title: 'あいうえお', script: 'あ', category: 'hiragana', teaching_style: 'animated_teacher' }, 'admin-token');
        assertEquals(r.status, 501);
        assert(/No AI video provider/.test(r.body.error));
      });
    } finally { await stop(gv); }

    const gv2 = await startFunction('generate-video', 54404, { VIDEO_PROVIDER: 'test', VIDEO_PROVIDER_URL: 'https://example.invalid/jobs', VIDEO_PROVIDER_API_KEY: 'k', VIDEO_WEBHOOK_SECRET: 's' });
    try {
      await t.step('generate-video rejects Kanji in the script before calling any provider', async () => {
        const r = await post(54404, { title: 'Lesson', script: 'わたしは学生です', category: 'self_intro', teaching_style: 'ai_human_teacher' }, 'admin-token');
        assertEquals(r.status, 422);
        assert(/学/.test(r.body.details));
      });
    } finally { await stop(gv2); }

    const wh = await startFunction('video-webhook', 54403, { VIDEO_WEBHOOK_SECRET: 'hook-secret' });
    try {
      await t.step('video-webhook rejects a wrong secret', async () => {
        assertEquals((await post(54403, { external_id: 'v1', state: 'ready', video_url: 'https://cdn.test/v.mp4' }, undefined, { 'x-webhook-secret': 'wrong' })).status, 401);
      });
      await t.step('video-webhook requires an https video URL', async () => {
        assertEquals((await post(54403, { external_id: 'v1', state: 'ready', video_url: 'http://cdn.test/v.mp4' }, undefined, { 'x-webhook-secret': 'hook-secret' })).status, 400);
      });
      await t.step('video-webhook attaches real media but leaves the video unpublished', async () => {
        videoUpdates.length = 0;
        const r = await post(54403, { external_id: 'v1', state: 'ready', video_url: 'https://cdn.test/v.mp4', duration_seconds: 61.4 }, undefined, { 'x-webhook-secret': 'hook-secret' });
        assertEquals(r.status, 200);
        assertEquals(videoUpdates[0].external_url, 'https://cdn.test/v.mp4');
        assertEquals(videoUpdates[0].duration_seconds, 61);
        assertEquals('status' in videoUpdates[0], false);
      });
    } finally { await stop(wh); }

    const au = await startFunction('admin-users', 54405);
    try {
      await t.step('admin-users is owner-only', async () => { assertEquals((await post(54405, { action: 'delete', user_id: 'x' }, 'learner-token')).status, 403); });
      await t.step('the owner cannot delete their own account', async () => {
        assertEquals((await post(54405, { action: 'delete', user_id: users['admin-token'].id }, 'admin-token')).status, 400);
      });
    } finally { await stop(au); }
  } finally {
    await mock.shutdown();
  }
});
