import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from './Brand';
import { useAuth } from '../auth/AuthProvider';
import { isConfigured } from '../lib/supabase';

const learnLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/learn/hiragana', label: 'Hiragana' },
  { to: '/learn/katakana', label: 'Katakana' },
  { to: '/learn/greetings', label: 'Greetings' },
  { to: '/learn/self-intro', label: 'Self-intro' },
  { to: '/learn/business', label: 'Business' },
  { to: '/writing', label: 'Writing' },
  { to: '/videos', label: 'Videos' },
];

export function ConfigWarning() {
  if (isConfigured) return null;
  return (
    <div className="bg-charcoal px-4 py-2 text-center text-sm text-white">
      Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. See README.
    </div>
  );
}

export function PublicHeader() {
  const { session, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-blush/70 bg-ivory/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <a href="/#about" className="btn-ghost">About</a>
          <a href="/#modules" className="btn-ghost">Modules</a>
          <a href="/#videos" className="btn-ghost">Videos</a>
          <a href="/#progress" className="btn-ghost">Progress</a>
          {session ? (
            <Link to={isAdmin ? '/admin' : '/dashboard'} className="btn-primary ml-2">{isAdmin ? 'Owner dashboard' : 'My dashboard'}</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Log in</Link>
              <Link to="/register" className="btn-primary ml-1">Start for free</Link>
            </>
          )}
        </nav>
        <button className="btn-ghost md:hidden" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-blush px-5 py-3 md:hidden" aria-label="Main mobile">
          {['about', 'modules', 'videos', 'progress'].map((s) => <a key={s} href={`/#${s}`} onClick={() => setOpen(false)} className="btn-ghost justify-start capitalize">{s}</a>)}
          {session ? <Link to={isAdmin ? '/admin' : '/dashboard'} className="btn-primary">Dashboard</Link>
            : <><Link to="/login" className="btn-ghost justify-start">Log in</Link><Link to="/register" className="btn-primary">Start for free</Link></>}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-blush bg-white/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink">Learn Japanese. One Character at a Time. KanaBloom is free forever — no subscriptions, no paywalls.</p>
        </div>
        <div>
          <h4 className="mb-3 font-display font-semibold">Learn</h4>
          <ul className="space-y-1.5 text-sm text-ink">
            <li><Link to="/learn/hiragana">Hiragana</Link></li><li><Link to="/learn/katakana">Katakana</Link></li>
            <li><Link to="/learn/greetings">Greetings</Link></li><li><Link to="/learn/business">Business Japanese</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-display font-semibold">About</h4>
          <ul className="space-y-1.5 text-sm text-ink">
            <li><Link to="/register">Create account</Link></li><li><Link to="/login">Log in</Link></li>
            <li><a href="https://kanjivg.tagaini.net" target="_blank" rel="noreferrer">Stroke data: KanjiVG (CC BY-SA 3.0)</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-blush py-4 text-center text-xs text-mist">© {new Date().getFullYear()} KanaBloom · ひらがな · カタカナ · romaji</div>
    </footer>
  );
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ConfigWarning />
      <PublicHeader />
      <main className="flex-1">{children ?? <Outlet />}</main>
      <Footer />
    </div>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const logout = async () => { setBusy(true); try { await signOut(); nav('/'); } finally { setBusy(false); } };
  return (
    <div className="flex min-h-screen flex-col">
      <ConfigWarning />
      <header className="sticky top-0 z-40 border-b border-blush/70 bg-ivory/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <Logo to="/dashboard" />
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Learning">
            {learnLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-blush text-beni' : 'text-ink hover:bg-blush-soft'}`}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <NavLink to="/profile" className="text-sm text-ink hover:text-beni">{profile?.full_name}</NavLink>
            <button className="btn-soft !py-2 text-sm" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Log out'}</button>
          </div>
          <button className="btn-ghost lg:hidden" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
        </div>
        {open && (
          <nav className="grid grid-cols-2 gap-1 border-t border-blush px-5 py-3 lg:hidden" aria-label="Learning mobile">
            {learnLinks.map((l) => <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)} className="btn-ghost justify-start text-sm">{l.label}</NavLink>)}
            <NavLink to="/profile" onClick={() => setOpen(false)} className="btn-ghost justify-start text-sm">Profile</NavLink>
            <button className="btn-soft text-sm" onClick={logout} disabled={busy}>Log out</button>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8"><Outlet /></main>
      <Footer />
    </div>
  );
}
