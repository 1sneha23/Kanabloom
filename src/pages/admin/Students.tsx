import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rpc, supabase, errorMessage } from '../../lib/supabase';
import { useAsync } from '../../hooks/useAsync';
import { ErrorBanner, PageLoader, ProgressBar, ProgressRing, StatCard, SuccessBanner } from '../../components/ui';
import { formatDate, formatDateTime, formatDuration } from '../../lib/format';
import { downloadCsv, toCsv } from '../../lib/csv';
import type { DashboardStats, Profile } from '../../lib/types';

interface StudentRow {
  id: string; student_id: string; full_name: string; email: string; status: 'active' | 'suspended';
  registered_at: string; last_login_at: string | null; last_activity_at: string | null;
  learning_seconds: number; overall_pct: number; total_count: number;
}
const PAGE = 25;

export function Students() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useAsync(() => rpc<StudentRow[]>('admin_students', { p_search: search || null, p_limit: PAGE, p_offset: page * PAGE }), [search, page]);
  const total = data?.[0]?.total_count ?? 0;

  const exportAll = async () => {
    setExporting(true); setExportErr(null);
    try {
      const rows = await rpc<StudentRow[]>('admin_students', { p_search: search || null, p_limit: 1000, p_offset: 0 });
      downloadCsv(`kanabloom-students-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((r) => ({
        student_id: r.student_id, name: r.full_name, email: r.email, status: r.status,
        registered_at_utc: r.registered_at, last_login_utc: r.last_login_at ?? '', last_activity_utc: r.last_activity_at ?? '',
        learning_minutes: Math.round(r.learning_seconds / 60), overall_progress_pct: r.overall_pct,
      }))));
    } catch (e) { setExportErr(errorMessage(e)); } finally { setExporting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">Students</h1><p className="text-sm text-mist">{total} learner{total === 1 ? '' : 's'}{search && ` matching “${search}”`}</p></div>
        <div className="flex gap-2">
          <input className="input !w-64 !py-2" placeholder="Search name, email, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          <button className="btn-soft" onClick={exportAll} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ CSV'}</button>
        </div>
      </div>
      <ErrorBanner message={error ?? exportErr} onRetry={error ? reload : undefined} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-mist">
            {['Student ID', 'Name', 'Email', 'Registered', 'Last login', 'Learning time', 'Progress', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={8}><PageLoader /></td></tr>}
            {data?.map((r) => (
              <tr key={r.id} className="border-t border-blush hover:bg-blush-soft/60">
                <td className="px-4 py-3 font-mono text-xs">{r.student_id}</td>
                <td className="px-4 py-3"><Link className="font-medium hover:text-beni" to={`/admin/students/${r.id}`}>{r.full_name}</Link></td>
                <td className="px-4 py-3 text-mist">{r.email}</td>
                <td className="px-4 py-3">{formatDate(r.registered_at)}</td>
                <td className="px-4 py-3">{formatDateTime(r.last_login_at)}</td>
                <td className="px-4 py-3">{formatDuration(r.learning_seconds)}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><ProgressBar value={r.overall_pct} className="w-20" /><span className="text-xs">{Math.round(r.overall_pct)}%</span></div></td>
                <td className="px-4 py-3"><span className={`chip ${r.status === 'suspended' ? '!bg-charcoal !text-white' : ''}`}>{r.status}</span></td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-mist">No students found.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button className="btn-ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

interface Report {
  profile: Profile; stats: DashboardStats;
  logins: string[]; logouts: { at: string; type: string }[];
  sessions: { id: string; started_at: string; ended_at: string | null; end_reason: string | null; active_seconds: number; user_agent: string | null }[];
  daily: { day: string; seconds: number }[]; weekly: { week: string; seconds: number }[]; monthly: { month: string; seconds: number }[];
  characters: { char: string; script: string; romaji: string; mastered: boolean; viewed: boolean; quiz: string; best_writing: number }[];
  writing: { at: string; char: string; accuracy: number; mode: string }[];
  quizzes: { at: string; title: string; score: number; total: number; percent: number }[];
  lessons: { title: string; module: string; progress: number; completed: boolean; completed_at: string | null }[];
  videos: { title: string; position: number; max: number; duration: number | null; completed: boolean; updated_at: string }[];
  last_activity: { type: string; at: string } | null;
}

export function StudentReport() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => rpc<Report>('admin_student_report', { p_user_id: id }), [id]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [msg, setMsg] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const { profile: p, stats: s } = data;
  const tz = p.timezone;

  const toggleStatus = async () => {
    const next = p.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`${next === 'suspended' ? 'Suspend' : 'Reactivate'} ${p.full_name}?`)) return;
    setBusy(true); setActErr(null);
    try { const { error } = await supabase.from('profiles').update({ status: next }).eq('id', p.id); if (error) throw error; setMsg(`Account ${next}.`); reload(); }
    catch (e) { setActErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (prompt(`Type the student ID (${p.student_id}) to permanently delete this account and all its records.`) !== p.student_id) return;
    setBusy(true); setActErr(null);
    try { const { error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', user_id: p.id } }); if (error) throw error; nav('/admin/students'); }
    catch (e) { setActErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const exportReport = () => {
    const sec = (n: number) => Math.round(n / 60);
    const rows: Record<string, unknown>[] = [
      ...data.daily.map((d) => ({ section: 'daily_minutes', key: d.day, value: sec(d.seconds) })),
      ...data.weekly.map((d) => ({ section: 'weekly_minutes', key: d.week, value: sec(d.seconds) })),
      ...data.monthly.map((d) => ({ section: 'monthly_minutes', key: d.month, value: sec(d.seconds) })),
      ...data.logins.map((at) => ({ section: 'login_utc', key: at, value: '' })),
      ...data.logouts.map((l) => ({ section: l.type === 'logout' ? 'logout_utc' : 'timeout_utc', key: l.at, value: '' })),
      ...data.characters.map((c) => ({ section: `character_${c.script}`, key: `${c.char} (${c.romaji})`, value: `mastered=${c.mastered}; quiz=${c.quiz}; best_writing=${c.best_writing}` })),
      ...data.quizzes.map((q) => ({ section: 'quiz', key: q.at, value: `${q.title}: ${q.score}/${q.total} (${q.percent}%)` })),
      ...data.writing.map((w) => ({ section: 'writing', key: w.at, value: `${w.char} ${w.accuracy}% (${w.mode})` })),
      ...data.lessons.map((l) => ({ section: 'lesson', key: l.title, value: `${l.progress}%${l.completed ? ' completed ' + l.completed_at : ''}` })),
      ...data.videos.map((v) => ({ section: 'video', key: v.title, value: `${v.completed ? 'completed' : 'in progress'}; watched to ${Math.round(v.max)}s` })),
    ];
    downloadCsv(`kanabloom-${p.student_id}.csv`, toCsv([
      { section: 'profile', key: 'student_id', value: p.student_id }, { section: 'profile', key: 'name', value: p.full_name },
      { section: 'profile', key: 'email', value: p.email }, { section: 'profile', key: 'registered_utc', value: p.registered_at },
      { section: 'summary', key: 'total_learning_minutes', value: sec(s.total_seconds) }, { section: 'summary', key: 'overall_pct', value: s.overall_pct },
      ...rows], ['section', 'key', 'value']));
  };

  const chart = period === 'daily' ? data.daily.map((d) => ({ label: d.day.slice(5), minutes: Math.round(d.seconds / 60) }))
    : period === 'weekly' ? data.weekly.map((d) => ({ label: d.week.slice(5), minutes: Math.round(d.seconds / 60) }))
    : data.monthly.map((d) => ({ label: d.month.slice(0, 7), minutes: Math.round(d.seconds / 60) }));

  return (
    <div className="space-y-6">
      <Link to="/admin/students" className="btn-ghost !px-2 text-sm">← Students</Link>
      <SuccessBanner message={msg} /><ErrorBanner message={actErr} />
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-3xl font-semibold">{p.full_name}</h1>
          <div className="text-sm text-mist"><span className="font-mono">{p.student_id}</span> · {p.email} · <span className="chip">{p.status}</span></div>
          <div className="mt-1 text-xs text-mist">Registered {formatDateTime(p.registered_at, tz)} · Last activity {data.last_activity ? `${formatDateTime(data.last_activity.at, tz)} (${data.last_activity.type.replace(/_/g, ' ')})` : '—'} · Times shown in {tz}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={exportReport}>⬇ Report CSV</button>
          <button className="btn-soft" onClick={toggleStatus} disabled={busy}>{p.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
          <button className="btn-ghost text-beni" onClick={remove} disabled={busy}>Delete</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="⏱" label="Total learning time" value={formatDuration(s.total_seconds)} hint={`${s.streak_days}-day streak`} />
        <StatCard icon="📚" label="Lessons completed" value={`${s.lessons.completed} / ${s.lessons.total}`} />
        <StatCard icon="🎯" label="Average quiz score" value={s.avg_quiz_pct !== null ? `${Math.round(s.avg_quiz_pct)}%` : '—'} />
        <StatCard icon="✍️" label="Writing accuracy" value={s.avg_writing_accuracy !== null ? `${Math.round(s.avg_writing_accuracy)}%` : '—'} hint={`${data.writing.length} attempts`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-wrap items-center justify-around gap-4 p-6">
          <ProgressRing value={s.overall_pct} sublabel="overall" />
          <ProgressRing value={s.hiragana.total ? s.hiragana.mastered / s.hiragana.total * 100 : 0} size={96} label={`${s.hiragana.mastered}`} sublabel="hiragana" />
          <ProgressRing value={s.katakana.total ? s.katakana.mastered / s.katakana.total * 100 : 0} size={96} label={`${s.katakana.mastered}`} sublabel="katakana" color="var(--color-sakura-deep)" />
          <div className="w-full text-center text-sm text-mist">Videos watched: {s.videos.completed} completed of {data.videos.length} started</div>
        </div>
        <div className="card p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Learning time (minutes)</h2>
            <div className="inline-flex rounded-full bg-blush p-1 text-xs">{(['daily', 'weekly', 'monthly'] as const).map((k) => (
              <button key={k} onClick={() => setPeriod(k)} className={`rounded-full px-3 py-1 capitalize ${period === k ? 'bg-white text-beni shadow' : ''}`}>{k}</button>))}</div></div>
          <div className="h-52"><ResponsiveContainer><BarChart data={chart} margin={{ left: -24 }}><CartesianGrid stroke="#FBE4EA" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="minutes" fill="#B83A4B" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Writing accuracy trend</h2>
          {data.writing.length === 0 ? <p className="text-sm text-mist">No writing attempts yet.</p> :
            <div className="h-48"><ResponsiveContainer><LineChart data={data.writing.map((w, i) => ({ i: i + 1, accuracy: w.accuracy, char: w.char }))} margin={{ left: -24 }}>
              <CartesianGrid stroke="#FBE4EA" vertical={false} /><XAxis dataKey="i" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}%`, 'Accuracy']} /><Line dataKey="accuracy" stroke="#7E9F7A" strokeWidth={2.5} dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div>}
        </div>
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Quiz scores</h2>
          <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {data.quizzes.length === 0 && <p className="text-mist">No quiz attempts yet.</p>}
            {data.quizzes.map((q, i) => <div key={i} className="flex justify-between border-b border-blush py-1"><span className="kana">{q.title}</span><span>{q.score}/{q.total} · <span className="text-mist">{formatDateTime(q.at, tz)}</span></span></div>)}
          </div>
        </div>
      </div>
      <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Character progress</h2>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-[repeat(23,minmax(0,1fr))]">
          {data.characters.map((c) => (
            <div key={c.script + c.char} title={`${c.romaji} · quiz ${c.quiz} · best writing ${c.best_writing}%`}
                 className={`kana flex aspect-square items-center justify-center rounded-lg text-lg ${c.mastered ? 'bg-beni text-white' : c.viewed ? 'bg-blush' : 'bg-ivory text-mist'}`}>{c.char}</div>
          ))}
        </div>
        <p className="mt-2 text-xs text-mist">Red = mastered · pink = studied · grey = not started. Hover for details.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Lessons</h2>
          {data.lessons.length === 0 ? <p className="text-sm text-mist">No lessons started.</p> : data.lessons.map((l, i) => (
            <div key={i} className="mb-2"><div className="flex justify-between text-sm"><span>{l.title}</span><span className="text-mist">{l.completed ? `✓ ${formatDate(l.completed_at, tz)}` : `${l.progress}%`}</span></div><ProgressBar value={l.progress} /></div>))}
        </div>
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Videos watched</h2>
          {data.videos.length === 0 ? <p className="text-sm text-mist">No videos watched.</p> : data.videos.map((v, i) => (
            <div key={i} className="flex justify-between border-b border-blush py-1.5 text-sm"><span className="kana">{v.title}</span><span className="text-mist">{v.completed ? 'Completed' : `${formatDuration(v.max)} watched`}</span></div>))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Login history</h2>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">{data.logins.length === 0 && <li className="text-mist">No logins recorded.</li>}
            {data.logins.map((at, i) => <li key={i}>{formatDateTime(at, tz)}</li>)}</ul></div>
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Logout history</h2>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">{data.logouts.length === 0 && <li className="text-mist">No logouts recorded.</li>}
            {data.logouts.map((l, i) => <li key={i} className="flex justify-between"><span>{formatDateTime(l.at, tz)}</span><span className="text-mist">{l.type === 'logout' ? 'logged out' : 'session timed out'}</span></li>)}</ul></div>
      </div>
      <div className="card overflow-x-auto p-6"><h2 className="mb-3 text-lg font-semibold">Learning sessions</h2>
        <table className="w-full min-w-[640px] text-sm"><thead><tr className="text-left text-xs uppercase text-mist"><th className="py-2">Started</th><th>Ended</th><th>Active time</th><th>End reason</th><th>Device</th></tr></thead>
          <tbody>{data.sessions.map((x) => (
            <tr key={x.id} className="border-t border-blush"><td className="py-2">{formatDateTime(x.started_at, tz)}</td><td>{x.ended_at ? formatDateTime(x.ended_at, tz) : <span className="chip">open</span>}</td>
              <td>{formatDuration(x.active_seconds)}</td><td className="text-mist">{x.end_reason ?? '—'}</td><td className="max-w-[220px] truncate text-xs text-mist" title={x.user_agent ?? ''}>{x.user_agent}</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}
