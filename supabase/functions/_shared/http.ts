// Shared helpers for KanaBloom edge functions (Deno).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*';
export const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Service-role client. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase; never sent to browsers. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Verify the caller's JWT and load their profile. */
export async function caller(req: Request): Promise<{ user: User; role: string; status: string } | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Invalid session' }, 401);
  const { data: p } = await db.from('profiles').select('role,status').eq('id', data.user.id).single();
  if (!p) return json({ error: 'Profile not found' }, 403);
  if (p.status !== 'active') return json({ error: 'Account is not active' }, 403);
  return { user: data.user, role: p.role, status: p.status };
}
