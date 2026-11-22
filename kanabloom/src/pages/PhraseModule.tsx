import { useEffect, useRef, useState } from 'react';
import { fetchLessons, fetchMyLessonProgress, fetchQuizList } from '../lib/api';
import { rpc } from '../lib/supabase';
import { useAsync } from '../hooks/useAsync';
import type { Lesson, Module, PhraseItem, SentenceBuilder } from '../lib/types';
import { AudioButton } from '../components/AudioButton';
import { LessonQuiz } from '../components/Quiz';
import { EmptyState, ErrorBanner, PageLoader, ProgressBar, SectionTitle } from '../components/ui';

const META: Record<string, { eyebrow: string; title: string; blurb: string }> = {
  greetings: { eyebrow: 'あいさつ', title: 'Basic Greetings', blurb: 'Open and close any conversation politely.' },
  self_intro: { eyebrow: 'じこしょうかい', title: 'Self-introduction', blurb: 'Tell people who you are — then build the sentences yourself.' },
  business: { eyebrow: 'ビジネス', title: 'Basic Business Japanese', blurb: 'Workplace vocabulary and polite office expressions.' },
};

export default function PhraseModule({ module }: { module: Module }) {
  const { data, loading, error, reload } = useAsync(async () => {
    const [lessons, progress, quizzes] = await Promise.all([fetchLessons(module), fetchMyLessonProgress(), fetchQuizList()]);
    return { lessons, progress, quizzes: quizzes.filter((q) => q.module === module) };
  }, [module]);
  const [active, setActive] = useState<string | null>(null);
  const meta = META[module];

  useEffect(() => { if (data && !active && data.lessons[0]) setActive(data.lessons[0].id); }, [data, active]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.lessons.length === 0) return <EmptyState title="No lessons published yet">Check back soon.</EmptyState>;
  const lesson = data.lessons.find((l) => l.id === active) ?? data.lessons[0];

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow={meta.eyebrow} title={meta.title}>{meta.blurb}</SectionTitle>
      {data.lessons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.lessons.map((l) => {
            const p = data.progress.get(l.id);
            return (
              <button key={l.id} onClick={() => setActive(l.id)} className={`rounded-full px-4 py-2 text-sm font-medium transition ${l.id === lesson.id ? 'bg-beni text-white' : 'bg-white text-ink ring-1 ring-blush hover:bg-blush-soft'}`}>
                {l.title} {p?.completed && '✓'}
              </button>
            );
          })}
        </div>
      )}
      <LessonView key={lesson.id} lesson={lesson} initial={data.progress.get(lesson.id)?.progress_pct ?? 0} onProgress={reload} />
      {data.quizzes.length > 0 && (
        <section className="card p-6">
          <h2 className="mb-4 text-2xl font-semibold">Check yourself</h2>
          {data.quizzes.map((q) => <QuizBlock key={q.id} id={q.id} title={q.title} />)}
        </section>
      )}
    </div>
  );
}

function QuizBlock({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-2xl border border-blush p-4">
      <div className="flex items-center justify-between"><span className="font-semibold">{title}</span>
        <button className="btn-soft !py-1.5 text-sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Start quiz'}</button></div>
      {open && <div className="mt-4"><LessonQuiz quizId={id} /></div>}
    </div>
  );
}

function LessonView({ lesson, initial, onProgress }: { lesson: Lesson; initial: number; onProgress: () => void }) {
  const items = lesson.content.items ?? [];
  const builders = lesson.content.builder ?? [];
  const total = items.length + builders.length;
  const [seen, setSeen] = useState<Set<number>>(() => new Set(Array.from({ length: Math.round((initial / 100) * total) }, (_, i) => i)));
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(initial);
  const pct = total ? Math.round((seen.size / total) * 100) : 100;

  // Save progress whenever it moves forward (the server ignores decreases).
  useEffect(() => {
    if (pct <= sent.current) return;
    const t = setTimeout(async () => {
      try { await rpc('record_lesson_progress', { p_lesson_id: lesson.id, p_progress: pct }); sent.current = pct; setError(null); if (pct === 100) onProgress(); }
      catch { setError('Progress could not be saved right now — it will retry as you continue.'); }
    }, 600);
    return () => clearTimeout(t);
  }, [pct, lesson.id, onProgress]);

  const mark = (i: number) => setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold">{lesson.title}</h2>
        {lesson.content.intro && <p className="mt-2 text-ink">{lesson.content.intro}</p>}
        <div className="mt-4 flex items-center gap-3"><ProgressBar value={pct} className="flex-1" /><span className="text-sm text-mist">{pct}%</span></div>
        <ErrorBanner message={error} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it, i) => <PhraseCard key={i} item={it} done={seen.has(i)} onDone={() => mark(i)} />)}
      </div>
      {builders.length > 0 && (
        <section className="card p-6">
          <h3 className="mb-1 text-xl font-semibold">Sentence builder</h3>
          <p className="mb-4 text-sm text-mist">Tap the tiles in the right order.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {builders.map((b, i) => <Builder key={i} b={b} onSolved={() => mark(items.length + i)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function PhraseCard({ item, done, onDone }: { item: PhraseItem; done: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`card p-5 transition ${done ? 'ring-2 ring-sakura' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="kana text-3xl leading-snug">{item.jp}</div>
          <div className="text-ink">{item.romaji}</div>
          <div className="font-medium text-beni">{item.en}</div>
        </div>
        <AudioButton text={item.jp} small />
      </div>
      {item.pronunciation && <p className="mt-2 text-xs text-mist">Say it: {item.pronunciation}</p>}
      {(item.usage || item.example || item.conversation) && (
        <button className="mt-3 text-sm font-medium text-beni" onClick={() => { setOpen(!open); onDone(); }}>{open ? 'Hide details' : 'Usage & examples ▾'}</button>
      )}
      {open && (
        <div className="mt-3 space-y-3 border-t border-blush pt-3 text-sm">
          {item.usage && <p className="text-ink">{item.usage}</p>}
          {item.example && (
            <div className="rounded-xl bg-blush-soft p-3"><div className="kana text-lg">{item.example.jp}</div><div className="text-ink">{item.example.romaji}</div><div className="text-mist">{item.example.en}</div></div>
          )}
          {item.conversation && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-mist">Conversation</div>
              {item.conversation.map((l, i) => (
                <div key={i} className={`flex gap-2 ${i % 2 ? 'flex-row-reverse text-right' : ''}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sakura text-xs font-bold text-white">{l.speaker ?? '•'}</span>
                  <div className={`rounded-2xl px-3 py-2 ${i % 2 ? 'bg-blush' : 'bg-ivory'}`}>
                    <div className="kana">{l.jp} <AudioButton text={l.jp} small /></div><div className="text-xs text-ink">{l.romaji}</div><div className="text-xs text-mist">{l.en}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!item.usage && !item.example && !item.conversation && !done && <button className="mt-3 text-sm font-medium text-beni" onClick={onDone}>Got it ✓</button>}
    </article>
  );
}

function Builder({ b, onSolved }: { b: SentenceBuilder; onSolved: () => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const answer = picked.map((i) => b.tiles[i]);
  const complete = picked.length === b.answer.length;
  const correct = complete && answer.every((t, i) => t === b.answer[i]);
  useEffect(() => { if (correct) onSolved(); }, [correct]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`rounded-2xl border-2 p-4 ${correct ? 'border-matcha bg-matcha/5' : complete ? 'border-beni/40' : 'border-blush'}`}>
      <div className="mb-3 text-sm font-medium">{b.prompt}</div>
      <div className="mb-3 flex min-h-12 flex-wrap gap-2 rounded-xl bg-ivory p-2">
        {answer.map((t, i) => <span key={i} className="kana rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm">{t}</span>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {b.tiles.map((t, i) => (
          <button key={i} disabled={picked.includes(i) || correct} onClick={() => setPicked([...picked, i])}
                  className="kana rounded-lg border border-sakura bg-white px-3 py-1.5 text-lg transition hover:bg-blush disabled:opacity-30">{t}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        {correct ? <span className="text-[#4f6b4c]">✓ {b.romaji} — {b.en}</span> : complete ? <span className="text-beni">Not quite — try again.</span> : <span />}
        {!correct && picked.length > 0 && <button className="text-beni" onClick={() => setPicked([])}>Reset</button>}
      </div>
    </div>
  );
}
