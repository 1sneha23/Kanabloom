// Called by the AI video provider (or your adapter) when a generated video is ready or has failed.
// Authenticated with the shared VIDEO_WEBHOOK_SECRET header. The video stays a DRAFT:
// the owner reviews it in the dashboard and publishes it (which runs the no-Kanji check).
//
// Expected body: { external_id: <videos.id>, state: "ready" | "failed", video_url?: "https://...",
//                  thumbnail_url?: "https://...", duration_seconds?: number, captions_vtt?: string, error?: string }
import { admin, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('VIDEO_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const id = String(b.external_id ?? '');
  const db = admin();
  const { data: v } = await db.from('videos').select('id,generation,captions_vtt').eq('id', id).single();
  if (!v) return json({ error: 'Unknown video' }, 404);

  const gen = { ...(v.generation ?? {}), updated_at: new Date().toISOString() } as Record<string, unknown>;
  if (b.state === 'ready') {
    const url = String(b.video_url ?? '');
    if (!/^https:\/\//.test(url)) return json({ error: 'video_url must be https' }, 400);
    gen.state = 'ready';
    const { error } = await db.from('videos').update({
      external_url: url, generation: gen,
      duration_seconds: typeof b.duration_seconds === 'number' ? Math.round(b.duration_seconds) : null,
      captions_vtt: typeof b.captions_vtt === 'string' && b.captions_vtt ? b.captions_vtt : v.captions_vtt,
    }).eq('id', id);
    if (error) return json({ error: error.message }, 400);
  } else {
    gen.state = 'failed'; gen.error = String(b.error ?? 'Provider reported failure');
    await db.from('videos').update({ generation: gen }).eq('id', id);
  }
  return json({ ok: true });
});
