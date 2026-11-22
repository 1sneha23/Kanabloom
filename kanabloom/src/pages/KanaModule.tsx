import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchCharacters, fetchMyCharacterProgress } from '../lib/api';
import { rpc } from '../lib/supabase';
import { useAsync } from '../hooks/useAsync';
import type { Character, CharacterProgress, Script } from '../lib/types';
import { ErrorBanner, PageLoader, ProgressBar, SectionTitle } from '../components/ui';
import { StrokeOrder } from '../components/StrokeOrder';
import { AudioButton } from '../components/AudioButton';
import { CharacterQuiz } from '../components/Quiz';
import { WritingCanvas } from '../components/WritingCanvas';

// Gojūon layout: 5 columns per row, with gaps where a sound does not exist (ya/yu/yo, wa/wo, n).
const ROWS = ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa', 'n'];
const SLOTS: Record<string, (string | null)[]> = {
  ya: ['ya', null, 'yu', null, 'yo'], wa: ['wa', null, null, null, 'wo'], n: ['n', null, null, null, null],
};

function status(p?: CharacterProgress): 'mastered' | 'learning' | 'new' {
  if (p?.mastered) return 'mastered';
  if (p && (p.first_viewed_at || p.quiz_attempts || p.writing_attempts)) return 'learning';
  return 'new';
}

function useKana(script: Script) {
  return useAsync(async () => {
    const [chars, progress] = await Promise.all([fetchCharacters(script), fetchMyCharacterProgress()]);
    return { chars, progress };
  }, [script]);
}

export function KanaModule({ script }: { script: Script }) {
  const { data, loading, error, reload } = useKana(script);
  const [quizMode, setQuizMode] = useState(false);
  const title = script === 'hiragana' ? 'Hiragana' : 'Katakana';
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const { chars, progress } = data;
  const mastered = chars.filter((c) => progress.get(c.id)?.mastered).length;
  const byRow = ROWS.map((row) => {
    const inRow = chars.filter((c) => c.row_label === row);
    const slots = SLOTS[row];
    return slots ? slots.map((r) => (r ? inRow.find((c) => c.romaji === r) ?? null : null)) : inRow;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle eyebrow={script === 'hiragana' ? 'ひらがな' : 'カタカナ'} title={title}>
          {script === 'hiragana' ? 'The core Japanese script for native words and grammar.' : 'The script for foreign loanwords, names and emphasis.'} Tap a character to learn it.
        </SectionTitle>
        <div className="card w-full max-w-xs p-4">
          <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">{mastered} / {chars.length} mastered</span><span className="text-mist">{Math.round((mastered / chars.length) * 100)}%</span></div>
          <ProgressBar value={(mastered / chars.length) * 100} />
          <button className="btn-soft mt-3 w-full !py-2 text-sm" onClick={() => setQuizMode(!quizMode)}>{quizMode ? 'Back to chart' : '🎯 Quick quiz mode'}</button>
        </div>
      </div>

      {quizMode ? <QuickQuiz chars={chars} onAnswered={reload} /> : (
        <div className="card mx-auto max-w-3xl overflow-x-auto p-4 md:p-6">
          <div className="grid min-w-[320px] grid-cols-5 gap-2 md:gap-3">
            {byRow.flat().map((c, i) => c ? (
              <Link key={c.id} to={`/learn/${script}/${encodeURIComponent(c.char)}`}
                    className={`group relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] ${
                      { mastered: 'border-sakura bg-blush', learning: 'border-sakura/40 bg-blush-soft', new: 'border-blush bg-white' }[status(progress.get(c.id))]}`}>
                <span className="kana text-3xl text-charcoal md:text-5xl">{c.char}</span>
                <span className="text-xs text-mist md:text-sm">{c.romaji}</span>
                {status(progress.get(c.id)) === 'mastered' && <span className="absolute right-1.5 top-1 text-xs text-beni" aria-label="mastered">✿</span>}
              </Link>
            ) : <div key={`gap${i}`} aria-hidden />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-mist">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-white ring-2 ring-blush" /> New</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blush-soft ring-2 ring-sakura/40" /> Learning</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blush ring-2 ring-sakura" /> Mastered</span>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickQuiz({ chars, onAnswered }: { chars: Character[]; onAnswered: () => void }) {
  const [order] = useState(() => [...chars].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const c = order[i % order.length];
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="text-sm text-mist">Score {score.right} / {score.total}</div>
      <div className="kana my-6 text-8xl">{c.char}</div>
      <CharacterQuiz key={`${c.id}-${i}`} character={c} pool={chars} onAnswered={(ok) => { setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 })); }} />
      <button className="btn-primary mt-4" onClick={() => { setI(i + 1); onAnswered(); }}>Next character →</button>
    </div>
  );
}

export function CharacterDetail({ script }: { script: Script }) {
  const { char = '' } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useKana(script);
  const [tab, setTab] = useState<'learn' | 'write' | 'quiz'>('learn');
  const c = useMemo(() => data?.chars.find((x) => x.char === decodeURIComponent(char)), [data, char]);
  const idx = data && c ? data.chars.indexOf(c) : -1;

  useEffect(() => { if (c) rpc('record_character_view', { p_character_id: c.id }).catch(console.warn); }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTab('learn'); }, [char]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data || !c) return <ErrorBanner message="Character not found." />;
  const p = data.progress.get(c.id);
  const prev = data.chars[idx - 1], next = data.chars[idx + 1];
  const go = (x?: Character) => x && nav(`/learn/${script}/${encodeURIComponent(x.char)}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to={`/learn/${script}`} className="btn-ghost !px-2 text-sm">← All {script}</Link>
        <div className="flex gap-2">
          <button className="btn-soft !py-2 text-sm" disabled={!prev} onClick={() => go(prev)}>‹ {prev?.char}</button>
          <button className="btn-soft !py-2 text-sm" disabled={!next} onClick={() => go(next)}>{next?.char} ›</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="card flex flex-col items-center gap-4 p-7 text-center">
          <div className="kana text-[9rem] leading-none text-charcoal">{c.char}</div>
          <div className="font-display text-3xl font-semibold text-beni">{c.romaji}</div>
          <p className="text-sm text-ink">{c.pronunciation}</p>
          <AudioButton text={c.char} audioPath={c.audio_path} label="Hear it" />
          <div className="w-full space-y-1 rounded-2xl bg-blush-soft p-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-mist">Viewed</span><span>✓</span></div>
            <div className="flex justify-between"><span className="text-mist">Quiz</span><span>{p?.quiz_correct ?? 0} correct / {p?.quiz_attempts ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-mist">Best writing</span><span>{p?.best_writing_accuracy ?? 0}%</span></div>
            <div className="flex justify-between font-semibold"><span>Status</span><span className="text-beni">{p?.mastered ? 'Mastered ✿' : 'Learning'}</span></div>
          </div>
        </aside>

        <section className="card p-6">
          <div className="mb-6 inline-flex rounded-full bg-blush p-1" role="tablist">
            {([['learn', 'Learn'], ['write', 'Write'], ['quiz', 'Quiz']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={`rounded-full px-5 py-2 text-sm font-medium ${tab === k ? 'bg-white text-beni shadow' : 'text-ink'}`}>{l}</button>
            ))}
          </div>
          {tab === 'learn' && (
            <div className="grid gap-8 md:grid-cols-2">
              <div><h3 className="mb-3 text-lg font-semibold">Stroke order · {c.stroke_count} stroke{c.stroke_count > 1 ? 's' : ''}</h3><StrokeOrder paths={c.stroke_paths} size={240} /></div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Example word</h3>
                <div className="rounded-2xl bg-blush-soft p-5">
                  <div className="kana text-4xl">{c.example_word}</div>
                  <div className="mt-1 text-ink">{c.example_romaji}</div>
                  <div className="text-sm text-mist">{c.example_meaning}</div>
                  <div className="mt-3"><AudioButton text={c.example_word} small /></div>
                </div>
                <button className="btn-primary" onClick={() => setTab('write')}>Practise writing →</button>
              </div>
            </div>
          )}
          {tab === 'write' && <WritingCanvas character={c} onSaved={() => reload()} />}
          {tab === 'quiz' && <div className="max-w-md"><CharacterQuiz character={c} pool={data.chars} onAnswered={() => reload()} /></div>}
        </section>
      </div>
    </div>
  );
}
