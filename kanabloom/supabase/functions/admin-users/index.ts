// Owner-only account management that needs the Auth admin API (deleting a user's login).
// Suspending / reactivating is done directly through RLS-protected profile updates.
import { admin, caller, cors, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (who instanceof Response) return who;
  if (who.role !== 'admin') return json({ error: 'Owner access required' }, 403);

  let body: { action?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (body.action !== 'delete' || !body.user_id) return json({ error: 'Unsupported action' }, 400);
  if (body.user_id === who.user.id) return json({ error: 'The owner account cannot delete itself' }, 400);

  const db = admin();
  const { data: target } = await db.from('profiles').select('id,role,email,student_id,full_name').eq('id', body.user_id).single();
  if (!target) return json({ error: 'Student not found' }, 404);
  if (target.role !== 'learner') return json({ error: 'Only learner accounts can be deleted' }, 400);

  // Audit first (the profile row disappears with the auth user via ON DELETE CASCADE).
  await db.from('admin_audit_logs').insert({ actor_id: who.user.id, action: 'delete_account', entity_type: 'profile', entity_id: target.id, before: target });
  const { error } = await db.auth.admin.deleteUser(target.id);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
