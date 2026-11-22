// Scores a handwriting attempt on the SERVER and records it as the official result.
// The browser shows a preview score, but only this function can write writing_attempts.
import { admin, caller, cors, json } from '../_shared/http.ts';
import { scoreWriting, validateDrawnStrokes, type Stroke } from '../_shared/strokes.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (who instanceof Response) return who;
  if (who.role !== 'learner') return json({ error: 'Only learners record writing attempts' }, 403);

  let body: { character_id?: string; client_attempt_id?: string; mode?: string; strokes?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { character_id, client_attempt_id, mode, strokes } = body;
  if (!character_id || !UUID.test(character_id) || !client_attempt_id || !UUID.test(client_attempt_id)) return json({ error: 'Invalid ids' }, 400);
  if (mode !== 'trace' && mode !== 'free') return json({ error: 'Invalid mode' }, 400);
  if (!validateDrawnStrokes(strokes)) return json({ error: 'Invalid strokes' }, 400);

  const db = admin();
  const { data: ch, error: chErr } = await db.from('characters').select('id,stroke_points,status').eq('id', character_id).single();
  if (chErr || !ch || ch.status !== 'published') return json({ error: 'Character not found' }, 404);

  const result = scoreWriting(ch.stroke_points as Stroke[], strokes as Stroke[]);
  const { data, error } = await db.rpc('record_writing_attempt', {
    p_user_id: who.user.id, p_character_id: character_id, p_client_attempt_id: client_attempt_id,
    p_mode: mode, p_strokes: strokes, p_accuracy: result.accuracy, p_feedback: result.feedback,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ ...data, accuracy: data.accuracy, feedback: result.feedback, per_stroke: result.perStroke });
});
