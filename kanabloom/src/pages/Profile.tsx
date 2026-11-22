import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, errorMessage } from '../lib/supabase';
import { formatDateTime, localTimezone } from '../lib/format';
import { ErrorBanner, SectionTitle, SuccessBanner } from '../components/ui';
import { validatePassword } from './Auth';

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  if (!profile) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setErr(null);
    if (name.trim().length < 2 || name.trim().length > 100) { setErr('Name must be 2–100 characters.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: name.trim(), timezone: localTimezone() }).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile(); setMsg('Profile updated.');
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setErr(null);
    const v = validatePassword(pw); if (v) { setErr(v); return; }
    setBusy(true);
    try { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; setPw(''); setMsg('Password changed.'); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionTitle eyebrow="プロフィール" title="Your profile" />
      <SuccessBanner message={msg} /><ErrorBanner message={err} />
      <div className="card grid gap-3 p-6 text-sm sm:grid-cols-2">
        <div><div className="text-mist">Student ID</div><div className="font-mono font-semibold">{profile.student_id}</div></div>
        <div><div className="text-mist">Email</div><div className="font-semibold">{profile.email}</div></div>
        <div><div className="text-mist">Registered</div><div>{formatDateTime(profile.registered_at)}</div></div>
        <div><div className="text-mist">Timezone</div><div>{profile.timezone}</div></div>
      </div>
      <form className="card space-y-3 p-6" onSubmit={saveName}>
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={busy}>Save</button>
      </form>
      <form className="card space-y-3 p-6" onSubmit={savePw}>
        <label className="label" htmlFor="pw">New password</label>
        <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-soft" disabled={busy || !pw}>Change password</button>
      </form>
    </div>
  );
}
