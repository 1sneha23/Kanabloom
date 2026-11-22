import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Brand';
import { useAuth } from '../../auth/AuthProvider';
import { ConfigWarning } from '../../components/Layout';

const links = [
  { to: '/admin', label: 'Overview', icon: '🌸', end: true },
  { to: '/admin/students', label: 'Students', icon: '👩‍🎓' },
  { to: '/admin/lessons', label: 'Lessons', icon: '📖' },
  { to: '/admin/quizzes', label: 'Quizzes', icon: '🎯' },
  { to: '/admin/videos', label: 'Videos', icon: '🎬' },
  { to: '/admin/characters', label: 'Characters & audio', icon: 'あ' },
  { to: '/admin/audit', label: 'Audit log', icon: '🧾' },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#FAF6F2]">
      <ConfigWarning />
      <div className="flex">
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-charcoal p-5 text-white transition lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-1"><Logo to="/admin" light /></div>
          <div className="mb-8 text-xs uppercase tracking-[0.2em] text-sakura">Owner dashboard</div>
          <nav className="space-y-1" aria-label="Admin">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
                       className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'}`}>
                <span className="w-5 text-center" aria-hidden>{l.icon}</span>{l.label}
              </NavLink>
            ))}
          </nav>
          <div className="absolute inset-x-5 bottom-5 space-y-2 text-xs text-white/60">
            <div>Signed in as <b className="text-white">{profile?.full_name}</b></div>
            <button className="w-full rounded-xl bg-white/10 py-2 text-white hover:bg-white/20" onClick={async () => { await signOut(); nav('/'); }}>Log out</button>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-blush bg-white/70 px-5 py-3 lg:hidden">
            <button className="btn-ghost" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
            <span className="font-display font-semibold">Owner dashboard</span><span />
          </header>
          <main className="mx-auto max-w-7xl p-5 md:p-8"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
