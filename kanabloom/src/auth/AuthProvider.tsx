import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, rpc, SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { ActivityTracker, BEAT_MS } from '../lib/activityTracker';
import { localTimezone } from '../lib/format';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  markActive: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

function tabClientId(): string {
  const key = 'kb-tab-id';
  let id = sessionStorage.getItem(key);
  if (!id) { id = `tab-${crypto.randomUUID()}`; sessionStorage.setItem(key, id); }
  return id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const tracker = useRef<ActivityTracker | null>(null);
  const tokenRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) { console.error(error); setProfile(null); return; }
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      tokenRef.current = data.session?.access_token ?? null;
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      tokenRef.current = s?.access_token ?? null;
      // Sign-ins via an email link (verification / recovery) don't go through signIn(): record the login here.
      if (event === 'SIGNED_IN' && /[?&]code=/.test(window.location.search)) {
        setTimeout(() => { rpc('record_login', { p_timezone: localTimezone() }).catch(console.warn); }, 0);
      }
      // Defer DB calls out of the auth callback (recommended by supabase-js to avoid deadlocks).
      setTimeout(() => { loadProfile(s?.user.id); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Active-time tracking for learners (the owner's own browsing is not tracked).
  useEffect(() => {
    if (!profile || profile.role !== 'learner' || profile.status !== 'active') return;
    let cancelled = false;
    let interval: number | undefined;
    let releaseLock: (() => void) | undefined;

    const t = new ActivityTracker({
      now: () => Date.now(),
      isVisible: () => document.visibilityState === 'visible',
      clientId: tabClientId(),
      startSession: (clientId) => rpc<string>('start_session', { p_client_id: clientId, p_user_agent: navigator.userAgent }),
      heartbeat: (sid) => rpc<{ status: 'ok' | 'ended' }>('heartbeat', { p_session_id: sid }),
      endSession: async (sid, reason, keepalive) => {
        if (keepalive && tokenRef.current) {
          // fetch keepalive survives page unload (sendBeacon cannot send the auth header).
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/end_session`, {
            method: 'POST', keepalive: true,
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenRef.current}` },
            body: JSON.stringify({ p_session_id: sid, p_reason: reason }),
          });
        } else {
          await rpc('end_session', { p_session_id: sid, p_reason: reason });
        }
      },
      onError: (e) => console.warn('[KanaBloom] activity tracking retry', e),
    });

    const onInput = () => t.markActive();
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    let lastMove = 0;
    const onMove = () => { const n = Date.now(); if (n - lastMove > 5000) { lastMove = n; t.markActive(); } };
    const onHide = () => { t.stop('closed', true); };
    const onShow = () => { if (document.visibilityState === 'visible') t.markActive(); };
    // Back/forward cache restores the page after pagehide: resume tracking with a fresh session.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) { t.markActive(); t.start().catch(console.warn); } };

    const run = async () => {
      if (cancelled) return;
      tracker.current = t;
      events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('pagehide', onHide);
      window.addEventListener('pageshow', onPageShow);
      document.addEventListener('visibilitychange', onShow);
      try { await t.start(); } catch (e) { console.warn(e); }
      interval = window.setInterval(() => { t.tick(); }, BEAT_MS);
    };

    // Only one tab per browser tracks time. Other tabs wait for the lock and take over if the tracking tab closes.
    if ('locks' in navigator) {
      navigator.locks.request('kanabloom-activity', () => new Promise<void>((resolve) => {
        releaseLock = resolve;
        run();
      }));
    } else {
      run();
    }

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, onInput));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onShow);
      if (tracker.current === t) tracker.current = null;
      releaseLock?.();
    };
  }, [profile?.id, profile?.role, profile?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    tokenRef.current = data.session?.access_token ?? null;
    try { await rpc('record_login', { p_timezone: localTimezone() }); } catch (e) { console.warn(e); }
    await loadProfile(data.user?.id);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (tracker.current) await tracker.current.stop('logout');
    // A non-tracking tab has no session id; end_session still records the logout event.
    else if (profile?.role === 'learner') { try { await rpc('end_session', { p_session_id: '00000000-0000-0000-0000-000000000000', p_reason: 'logout' }); } catch { /* ignore */ } }
    await supabase.auth.signOut();
    setProfile(null);
  }, [profile?.role]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading,
    isAdmin: profile?.role === 'admin' && profile.status === 'active',
    refreshProfile: () => loadProfile(session?.user.id),
    signIn, signOut,
    markActive: () => tracker.current?.markActive(),
  }), [session, profile, loading, loadProfile, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
