import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase, errorMessage } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Blossom } from '../components/Brand';
import { ErrorBanner, Spinner, SuccessBanner } from '../components/ui';

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-5 py-12">
      <div className="absolute inset-x-0 top-10 -z-10 mx-auto h-64 w-64 rounded-full bg-blush blur-3xl" aria-hidden />
      <div className="card animate-rise p-8">
        <Blossom size={44} className="mb-3" />
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
}

export function Register() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your full name.';
    if (form.name.trim().length > 100) errs.name = 'Name is too long.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    const pw = validatePassword(form.password); if (pw) errs.password = pw;
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs); setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(), password: form.password,
        // full_name is the only metadata used; the database ignores any role in metadata.
        options: { data: { full_name: form.name.trim() }, emailRedirectTo: `${location.origin}/login?verified=1` },
      });
      if (error) throw error;
      nav('/verify-email', { state: { email: form.email.trim() } });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const field = (key: keyof typeof form, label: string, type = 'text', auto?: string) => (
    <div>
      <label className="label" htmlFor={key}>{label}</label>
      <input id={key} className="input" type={type} autoComplete={auto} value={form[key]}
             aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-err` : undefined}
             onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      {errors[key] && <p id={`${key}-err`} className="mt-1 text-xs text-beni">{errors[key]}</p>}
    </div>
  );

  return (
    <AuthShell title="Create your free account" subtitle={<>Already learning? <Link to="/login" className="font-medium text-beni">Log in</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {field('name', 'Full name', 'text', 'name')}
        {field('email', 'Email address', 'email', 'email')}
        {field('password', 'Password', 'password', 'new-password')}
        {field('confirm', 'Confirm password', 'password', 'new-password')}
        <ErrorBanner message={error} />
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <><Spinner className="h-4 w-4 text-white" /> Creating account…</> : 'Create account'}</button>
        <p className="text-center text-xs text-mist">Free forever. We’ll email you a link to verify your address.</p>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const loc = useLocation() as { state?: { email?: string } };
  const email = loc.state?.email;
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    if (!email) return;
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${location.origin}/login?verified=1` } });
      if (error) throw error;
      setMsg('Verification email sent again.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Check your inbox" subtitle="One last step before you start.">
      <p className="text-ink">We sent a verification link to <b>{email ?? 'your email address'}</b>. Click it to activate your account, then log in.</p>
      <div className="mt-5 space-y-3">
        <SuccessBanner message={msg} /><ErrorBanner message={error} />
        {email && <button className="btn-soft w-full" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Resend email'}</button>}
        <Link to="/login" className="btn-ghost w-full">Go to log in</Link>
      </div>
    </AuthShell>
  );
}

export function Login() {
  const { signIn, session, isAdmin, profile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string }; search: string };
  const verified = new URLSearchParams(loc.search).get('verified');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session && profile) return <Navigate to={isAdmin ? '/admin' : (loc.state?.from ?? '/dashboard')} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try {
      await signIn(email.trim(), password);
      nav(loc.state?.from ?? '/dashboard', { replace: true });
    } catch (e) {
      const m = errorMessage(e);
      setError(/confirm/i.test(m) ? 'Please verify your email first — check your inbox for the link.' : /invalid/i.test(m) ? 'Email or password is incorrect.' : m);
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Welcome back" subtitle={<>New here? <Link to="/register" className="font-medium text-beni">Create a free account</Link></>}>
      {verified && <div className="mb-4"><SuccessBanner message="Email verified — you can log in now." /></div>}
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div><label className="label" htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><div className="flex items-baseline justify-between"><label className="label" htmlFor="password">Password</label>
          <Link to="/forgot-password" className="text-xs text-beni">Forgot password?</Link></div>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <ErrorBanner message={error} />
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <><Spinner className="h-4 w-4 text-white" /> Logging in…</> : 'Log in'}</button>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` });
      if (error) throw error;
      setSent(true);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a secure link.">
      {sent ? <SuccessBanner message="If an account exists for that email, a reset link is on its way." /> : (
        <form className="space-y-4" onSubmit={submit}>
          <div><label className="label" htmlFor="email">Email address</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <ErrorBanner message={error} />
          <button className="btn-primary w-full" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-beni">Back to log in</Link>
    </AuthShell>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The recovery link signs the user in with a short-lived recovery session.
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validatePassword(pw); if (v) { setError(v); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setDone(true);
      setTimeout(() => nav('/dashboard'), 1500);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Choose a new password">
      {!ready ? <p className="text-sm text-ink">Open this page from the link in your reset email. If the link has expired, <Link className="text-beni" to="/forgot-password">request a new one</Link>.</p>
        : done ? <SuccessBanner message="Password updated. Taking you to your dashboard…" /> : (
        <form className="space-y-4" onSubmit={submit}>
          <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div><label className="label" htmlFor="pw2">Confirm new password</label><input id="pw2" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <ErrorBanner message={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function Suspended() {
  const { signOut } = useAuth();
  return (
    <AuthShell title="Account paused" subtitle="Your KanaBloom account is currently suspended.">
      <p className="text-sm text-ink">Please contact the KanaBloom team if you think this is a mistake.</p>
      <button className="btn-soft mt-5 w-full" onClick={() => signOut()}>Log out</button>
    </AuthShell>
  );
}
