import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// The anon key is public by design; Row Level Security protects the data.
// The service-role key must never appear in browser code.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export const SUPABASE_URL = url ?? '';
export const SUPABASE_ANON_KEY = anonKey ?? '';

/** Turn Supabase/PostgREST errors into a readable message. Kanji errors include the field report. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  if (typeof e === 'string') return e;
  const any = e as { message?: string; details?: string; hint?: string };
  const parts = [any.message, any.details, any.hint].filter(Boolean);
  if (parts.length) return parts.join(' — ');
  return 'Something went wrong. Please try again.';
}

/** Call an RPC and throw on error, so callers can use try/catch. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
