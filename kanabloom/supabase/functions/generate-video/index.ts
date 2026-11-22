// Owner-only: request an AI-generated teaching video from an external provider.
//
// This is a provider-neutral integration. It POSTs a job to VIDEO_PROVIDER_URL and expects the
// provider (or a small adapter you host) to call back the video-webhook function when the video is ready.
// No video is ever faked: until real media arrives the row stays a draft with generation.state = 'queued'
// and the database refuses to publish a video without media.
//
// Secrets (set with `supabase secrets set ...`):
//   VIDEO_PROVIDER         name shown in the dashboard, e.g. "heygen", "synthesia", "d-id", "custom"
//   VIDEO_PROVIDER_URL     HTTPS endpoint that accepts the job (provider API or your adapter)
//   VIDEO_PROVIDER_API_KEY sent as "Authorization: Bearer <key>"
//   VIDEO_WEBHOOK_SECRET   shared secret the provider/adapter must send back to video-webhook
import { admin, caller, cors, json } from '../_shared/http.ts';
import { findKanji, formatViolations } from '../_shared/kanji.ts';

const STYLES = ['animated_teacher', 'ai_human_teacher', 'animated_characters'];
const MODULES = ['hiragana', 'katakana', 'greetings', 'self_intro', 'business', 'writing'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (who instanceof Response) return who;
  if (who.role !== 'admin') return json({ error: 'Owner access required' }, 403);

  const provider = Deno.env.get('VIDEO_PROVIDER');
  const url = Deno.env.get('VIDEO_PROVIDER_URL');
  const key = Deno.env.get('VIDEO_PROVIDER_API_KEY');
  const secret = Deno.env.get('VIDEO_WEBHOOK_SECRET');
  if (!provider || !url || !key || !secret) {
    return json({ error: 'No AI video provider is configured. Set VIDEO_PROVIDER, VIDEO_PROVIDER_URL, VIDEO_PROVIDER_API_KEY and VIDEO_WEBHOOK_SECRET (see README), or upload a generated video manually.' }, 501);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const title = String(b.title ?? '').trim(), script = String(b.script ?? '').trim();
  if (!title || !script) return json({ error: 'Title and script are required' }, 400);
  if (!STYLES.includes(String(b.teaching_style)) || !MODULES.includes(String(b.category))) return json({ error: 'Invalid style or category' }, 400);
  const v = findKanji({ title, description: b.description ?? '', script, captions: b.captions_vtt ?? '' });
  if (v.length) return json({ error: 'Kanji is not allowed', details: formatViolations(v) }, 422);

  const db = admin();
  const generation = { provider, state: 'queued', script, requested_by: who.user.id, updated_at: new Date().toISOString() };
  const fields = { title, description: String(b.description ?? ''), category: b.category, teaching_style: b.teaching_style, source: 'ai_generated', captions_vtt: String(b.captions_vtt ?? ''), generation, status: 'draft' };
  const q = b.video_id ? db.from('videos').update(fields).eq('id', b.video_id).select().single() : db.from('videos').insert(fields).select().single();
  const { data: video, error } = await q;
  if (error) return json({ error: error.message }, 400);

  const callback = `${Deno.env.get('SUPABASE_URL')}/functions/v1/video-webhook`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ external_id: video.id, title, script, style: b.teaching_style, language: 'ja', captions: true, callback_url: callback, callback_secret: secret }),
    });
  } catch (e) {
    await db.from('videos').update({ generation: { ...generation, state: 'failed', error: `Provider unreachable: ${e}` } }).eq('id', video.id);
    return json({ error: 'Video provider unreachable' }, 502);
  }
  const payload = await res.json().catch(() => ({}));
  const next = res.ok ? { ...generation, state: 'processing', job_id: payload.job_id ?? payload.id ?? null } : { ...generation, state: 'failed', error: `Provider returned ${res.status}` };
  const { data: updated } = await db.from('videos').update({ generation: next }).eq('id', video.id).select().single();
  return json({ video: updated ?? video }, res.ok ? 200 : 502);
});
