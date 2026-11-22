import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rpc } from '../../lib/supabase';
import { useAsync } from '../../hooks/useAsync';
import { ErrorBanner, PageLoader, StatCard } from '../../components/ui';
import { formatDateTime, shortDay } from '../../lib/format';

interface OverviewData {
  total_students: number; active_students: number; inactive_students: number; suspended_students: number;
  new_7d: number; new_30d: number; total_learning_hours: number; completed_lessons: number; avg_quiz_pct: number | null;
  quiz_attempts: number; writing_attempts: number; video_starts: number; video_completions: number;
  recent_registrations: { id: string; student_id: string; full_name: string; email: string; registered_at: string }[];
  registrations_30d: { day: string; count: number }[]; learning_14d: { day: string; hours: number }[];
}

export default function AdminOverview() {
  const { data, loading, error, reload } = useAsync(() => rpc<OverviewData>('admin_overview'), []);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const d = data;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><h1 className="text-3xl font-semibold">Overview</h1><p className="text-sm text-mist">Active = studied in the last 7 days.</p></div>
        <button className="btn-soft !py-2 text-sm" onClick={reload}>↻ Refresh</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="👩‍🎓" label="Registered students" value={d.total_students} hint={`${d.suspended_students} suspended`} />
        <StatCard icon="🌸" label="Active students" value={d.active_students} />
        <StatCard icon="💤" label="Inactive students" value={d.inactive_students} />
        <StatCard icon="✨" label="New registrations" value={d.new_7d} hint={`${d.new_30d} in 30 days`} />
        <StatCard icon="⏱" label="Total learning hours" value={d.total_learning_hours} />
        <StatCard icon="📚" label="Lessons completed" value={d.completed_lessons} />
        <StatCard icon="🎯" label="Average quiz score" value={d.avg_quiz_pct !== null ? `${Math.round(d.avg_quiz_pct)}%` : '—'} hint={`${d.quiz_attempts} attempts · ${d.writing_attempts} writing`} />
        <StatCard icon="🎬" label="Video activity" value={`${d.video_completions} / ${d.video_starts}`} hint="completed / started" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><h2 className="mb-4 text-lg font-semibold">Registrations (30 days, UTC)</h2>
          <div className="h-56"><ResponsiveContainer><BarChart data={d.registrations_30d.map((r) => ({ ...r, label: r.day.slice(5) }))} margin={{ left: -24 }}>
            <CartesianGrid stroke="#FBE4EA" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip /><Bar dataKey="count" fill="#E27D96" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="card p-6"><h2 className="mb-4 text-lg font-semibold">Learning hours (14 days)</h2>
          <div className="h-56"><ResponsiveContainer><BarChart data={d.learning_14d.map((r) => ({ ...r, label: shortDay(r.day) }))} margin={{ left: -24 }}>
            <CartesianGrid stroke="#FBE4EA" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
            <Tooltip /><Bar dataKey="hours" fill="#B83A4B" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      </div>
      <div className="card p-6">
        <div className="mb-3 flex justify-between"><h2 className="text-lg font-semibold">Recent registrations</h2><Link className="text-sm text-beni" to="/admin/students">All students →</Link></div>
        <table className="w-full text-sm"><tbody>
          {d.recent_registrations.map((r) => (
            <tr key={r.id} className="border-t border-blush"><td className="py-2 font-mono text-xs">{r.student_id}</td>
              <td><Link className="font-medium hover:text-beni" to={`/admin/students/${r.id}`}>{r.full_name}</Link></td>
              <td className="hidden text-mist md:table-cell">{r.email}</td><td className="text-right text-mist">{formatDateTime(r.registered_at)}</td></tr>
          ))}
          {d.recent_registrations.length === 0 && <tr><td className="py-4 text-mist">No students yet.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
