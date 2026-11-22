import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rpc } from '../lib/supabase';
import { useAsync } from '../hooks/useAsync';
import type { DashboardStats } from '../lib/types';
import { formatDateTime, formatDuration, shortDay } from '../lib/format';
import { EmptyState, ErrorBanner, PageLoader, ProgressBar, ProgressRing, StatCard } from '../components/ui';
import { Blossom } from '../components/Brand';

interface DashboardData {
  profile: { full_name: string; student_id: string; registered_at: string };
  stats: DashboardStats;
  recommended: null | { kind: 'character'; id: string; script: string; char: string; romaji: string } | { kind: 'lesson'; id: string; slug: string; module: string; title: string };
  daily: { day: string; seconds: number }[];
  quiz_history: { at: string; percent: number; title: string }[];
  writing_history: { at: string; accuracy: number; char: string }[];
  recent: { type: string; at: string; label: string | null; metadata: Record<string, unknown> }[];
  achievements: { key: string; title: string; description: string; earned: boolean }[];
}

const EVENT_LABEL: Record<string, (label: string | null, m: Record<string, unknown>) => string> = {
  login: () => 'Logged in', logout: () => 'Logged out',
  lesson_view: (l) => `Started lesson “${l}”`, lesson_complete: (l) => `Completed lesson “${l}”`,
  character_view: (l) => `Studied ${l}`, character_quiz: (l, m) => `Quiz on ${l}: ${m.correct ? 'correct' : 'incorrect'}`,
  character_mastered: (l) => `Mastered ${l} ✿`, quiz_attempt: (l, m) => `Quiz “${l}”: ${m.score}/${m.total}`,
  writing_attempt: (l, m) => `Wrote ${l} — ${m.accuracy}%`, video_complete: (l) => `Finished video “${l}”`,
};

const MODULE_PATH: Record<string, string> = { greetings: 'greetings', self_intro: 'self-intro', business: 'business' };

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync(() => rpc<DashboardData>('my_dashboard'), []);
  if (loading && !data) return <PageLoader label="Gathering your blossoms…" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const { stats, profile } = data;
  const hPct = stats.hiragana.total ? (stats.hiragana.mastered / stats.hiragana.total) * 100 : 0;
  const kPct = stats.katakana.total ? (stats.katakana.mastered / stats.katakana.total) * 100 : 0;
  const first = profile.full_name.split(' ')[0];
  const rec = data.recommended;
  const recLink = !rec ? '/learn/hiragana' : rec.kind === 'character' ? `/learn/${rec.script}/${encodeURIComponent(rec.char)}` : `/learn/${MODULE_PATH[rec.module] ?? rec.module}`;
  const dailyChart = data.daily.map((d) => ({ day: shortDay(d.day), minutes: Math.round(d.seconds / 6) / 10 }));
  const weekSeconds = data.daily.slice(-7).reduce((a, d) => a + d.seconds, 0);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <section className="card relative overflow-hidden p-7 md:p-9">
        <Blossom size={200} className="absolute -right-12 -top-12 opacity-15" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="kana text-lg text-beni">おかえりなさい</p>
            <h1 className="text-4xl font-semibold">Welcome back, {first}!</h1>
            <p className="mt-1 text-sm text-mist">{profile.full_name} · Student ID <span className="font-mono">{profile.student_id}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {rec && (
              <div className="rounded-2xl bg-blush-soft px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-mist">Recommended next</div>
                <div className="font-semibold">{rec.kind === 'character' ? <><span className="kana text-2xl">{rec.char}</span> <span className="text-mist">({rec.romaji})</span></> : rec.title}</div>
              </div>
            )}
            <Link to={recLink} className="btn-primary !px-6 !py-3">Continue learning →</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="⏱" label="Total learning time" value={formatDuration(stats.total_seconds)} hint={`${formatDuration(weekSeconds)} this week`} />
        <StatCard icon="📚" label="Lessons completed" value={`${stats.lessons.completed} / ${stats.lessons.total}`} />
        <StatCard icon="🔥" label="Daily streak" value={`${stats.streak_days} day${stats.streak_days === 1 ? '' : 's'}`} hint="1+ minute a day keeps it alive" />
        <StatCard icon="🎯" label="Average quiz score" value={stats.avg_quiz_pct !== null ? `${Math.round(stats.avg_quiz_pct)}%` : '—'} hint={stats.avg_writing_accuracy !== null ? `Writing ${Math.round(stats.avg_writing_accuracy)}%` : undefined} />
      </section>

      {/* Progress */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center justify-center gap-3 p-6">
          <ProgressRing value={stats.overall_pct} size={150} stroke={12} sublabel="overall" />
          <h2 className="text-xl font-semibold">Overall progress</h2>
          <p className="text-center text-sm text-mist">Characters mastered and lessons completed across the course.</p>
        </div>
        <div className="card space-y-5 p-6 lg:col-span-2">
          {[['Hiragana', 'hiragana', hPct, stats.hiragana], ['Katakana', 'katakana', kPct, stats.katakana]].map(([label, path, pct, s]) => {
            const st = s as { mastered: number; total: number };
            return (
              <Link key={label as string} to={`/learn/${path}`} className="block rounded-2xl p-3 transition hover:bg-blush-soft">
                <div className="mb-2 flex items-baseline justify-between"><span className="font-semibold">{label as string}</span><span className="text-sm text-mist">{st.mastered} / {st.total} mastered</span></div>
                <ProgressBar value={pct as number} />
              </Link>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-blush-soft p-4"><div className="text-sm text-mist">Videos completed</div><div className="font-display text-xl font-semibold">{stats.videos.completed} / {stats.videos.total}</div></div>
            <div className="rounded-2xl bg-blush-soft p-4"><div className="text-sm text-mist">A character is mastered when you</div><div className="text-sm">study it, answer its quiz, and write it at 70%+.</div></div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-xl font-semibold">Daily study time <span className="text-sm font-normal text-mist">(minutes, last 14 days)</span></h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChart} margin={{ left: -20, right: 8 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E27D96" stopOpacity={0.5} /><stop offset="100%" stopColor="#E27D96" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#FBE4EA" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8C8891' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8C8891' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} min`, 'Study time']} contentStyle={{ borderRadius: 12, border: '1px solid #FBE4EA' }} />
                <Area type="monotone" dataKey="minutes" stroke="#B83A4B" strokeWidth={2.5} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-xl font-semibold">Quiz & writing trend</h2>
          {data.quiz_history.length + data.writing_history.length === 0 ? (
            <EmptyState icon="📈" title="No scores yet">Take a quiz or try the writing studio to see your trend.</EmptyState>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart margin={{ left: -20, right: 8 }}>
                  <CartesianGrid stroke="#FBE4EA" vertical={false} />
                  <XAxis dataKey="i" type="number" hide domain={['dataMin', 'dataMax']} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8C8891' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, n) => [`${v}%`, n]} labelFormatter={() => ''} contentStyle={{ borderRadius: 12, border: '1px solid #FBE4EA' }} />
                  <Line data={data.quiz_history.map((q, i) => ({ i, value: Number(q.percent) }))} dataKey="value" name="Quiz" stroke="#B83A4B" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line data={data.writing_history.map((w, i) => ({ i, value: w.accuracy }))} dataKey="value" name="Writing" stroke="#7E9F7A" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Activity + achievements */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-xl font-semibold">Recent activity</h2>
          {data.recent.length === 0 ? <p className="text-sm text-mist">Your activity will appear here as you learn.</p> : (
            <ol className="relative space-y-3 border-l-2 border-blush pl-5">
              {data.recent.map((a, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-sakura ring-4 ring-white" aria-hidden />
                  <div className="text-sm"><span className="kana">{(EVENT_LABEL[a.type] ?? (() => a.type))(a.label, a.metadata)}</span></div>
                  <div className="text-xs text-mist">{formatDateTime(a.at)}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-xl font-semibold">Achievements</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.achievements.map((a) => (
              <div key={a.key} title={a.description} className={`flex flex-col items-center rounded-2xl p-3 text-center transition ${a.earned ? 'bg-blush' : 'bg-ivory opacity-50 grayscale'}`}>
                <Blossom size={36} petal={a.earned ? 'var(--color-sakura)' : '#ddd'} center={a.earned ? 'var(--color-beni)' : '#bbb'} />
                <div className="mt-1 text-xs font-semibold leading-tight">{a.title}</div>
                <div className="text-[10px] leading-tight text-mist">{a.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
