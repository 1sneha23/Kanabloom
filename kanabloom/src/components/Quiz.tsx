import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc, errorMessage } from '../lib/supabase';
import type { Character, PublicQuiz } from '../lib/types';
import { uuid } from '../lib/format';
import { ErrorBanner, Spinner } from './ui';

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/** One-question recognition quiz for a character, graded on the server. */
export function CharacterQuiz({ character, pool, onAnswered }: { character: Character; pool: Character[]; onAnswered?: (correct: boolean) => void }) {
  const choices = useMemo(() => {
    const others = shuffle(pool.filter((c) => c.romaji !== character.romaji).map((c) => c.romaji));
    return shuffle([character.romaji, ...[...new Set(others)].slice(0, 3)]);
  }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null);
  const [res, setRes] = useState<{ correct: boolean; answer: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(uuid());

  useEffect(() => { setPicked(null); setRes(null); setError(null); attempt.current = uuid(); }, [character.id]);

  const answer = async (c: string) => {
    if (busy || res) return;
    setPicked(c); setBusy(true); setError(null);
    try {
      const r = await rpc<{ correct: boolean; answer: string }>('submit_character_quiz', { p_character_id: character.id, p_choice: c, p_client_attempt_id: attempt.current });
      setRes(r); onAnswered?.(r.correct);
    } catch (e) { setError(errorMessage(e)); setPicked(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">How do you read <span className="kana text-2xl text-charcoal">{character.char}</span>?</p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((c) => {
          const state = res ? (c === res.answer ? 'right' : c === picked ? 'wrong' : 'idle') : picked === c ? 'pending' : 'idle';
          return (
            <button key={c} onClick={() => answer(c)} disabled={!!res || busy}
                    className={`rounded-2xl border-2 px-4 py-3 text-lg font-medium transition ${
                      state === 'right' ? 'border-matcha bg-matcha/10 text-[#4f6b4c]' : state === 'wrong' ? 'border-beni bg-beni/5 text-beni' :
                      state === 'pending' ? 'border-sakura' : 'border-blush bg-white hover:border-sakura'}`}>
              {c}{state === 'pending' && <Spinner className="ml-2 inline h-4 w-4" />}
            </button>
          );
        })}
      </div>
      {res && <p className={`text-sm font-medium ${res.correct ? 'text-[#4f6b4c]' : 'text-beni'}`} aria-live="polite">{res.correct ? 'Correct! ✿' : `Not quite — it's “${res.answer}”.`}</p>}
      {res && <button className="btn-ghost !px-2 text-sm" onClick={() => { setPicked(null); setRes(null); attempt.current = uuid(); }}>Try another round</button>}
      <ErrorBanner message={error} />
    </div>
  );
}

interface QuizResult { score: number; total: number; percent: number; results: { chosen: number; correct: boolean; answer: number; explanation?: string }[] }

/** Multi-question lesson quiz. Answers are graded only on the server; the client never sees the key in advance. */
export function LessonQuiz({ quizId, onDone }: { quizId: string; onDone?: (r: QuizResult) => void }) {
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(uuid());

  const load = async () => {
    setError(null);
    try {
      const q = await rpc<PublicQuiz>('get_quiz', { p_quiz_id: quizId });
      setQuiz(q); setAnswers(q.questions.map(() => null)); setIdx(0); setResult(null); attempt.current = uuid();
    } catch (e) { setError(errorMessage(e)); }
  };
  useEffect(() => { load(); }, [quizId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!quiz || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await rpc<QuizResult>('submit_quiz', { p_quiz_id: quiz.id, p_answers: answers, p_client_attempt_id: attempt.current });
      setResult(r); onDone?.(r);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (error && !quiz) return <ErrorBanner message={error} onRetry={load} />;
  if (!quiz) return <div className="flex justify-center p-6"><Spinner /></div>;

  if (result) {
    return (
      <div className="space-y-4">
        <div className="card flex items-center justify-between p-5">
          <div><div className="text-sm text-mist">Your score</div><div className="font-display text-3xl font-semibold">{result.score} / {result.total}</div></div>
          <div className="font-display text-4xl font-semibold text-beni">{Math.round(result.percent)}%</div>
        </div>
        <ol className="space-y-2">
          {quiz.questions.map((q, i) => (
            <li key={i} className={`rounded-2xl border p-3 text-sm ${result.results[i].correct ? 'border-matcha/40 bg-matcha/5' : 'border-beni/30 bg-beni/5'}`}>
              <div className="font-medium">{i + 1}. {q.prompt}</div>
              <div>Your answer: <span className="kana">{q.choices[result.results[i].chosen] ?? '—'}</span> {result.results[i].correct ? '✓' : <>· Correct: <span className="kana">{q.choices[result.results[i].answer]}</span></>}</div>
            </li>
          ))}
        </ol>
        <button className="btn-soft" onClick={load}>Take it again</button>
      </div>
    );
  }

  const q = quiz.questions[idx];
  const done = answers.every((a) => a !== null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-mist"><span>Question {idx + 1} of {quiz.questions.length}</span><span>{answers.filter((a) => a !== null).length} answered</span></div>
      <p className="text-lg font-medium"><span className="kana">{q.prompt}</span></p>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.choices.map((c, ci) => (
          <button key={ci} onClick={() => { const a = [...answers]; a[idx] = ci; setAnswers(a); if (idx < quiz.questions.length - 1) setTimeout(() => setIdx(idx + 1), 220); }}
                  className={`kana rounded-2xl border-2 px-4 py-3 text-left text-lg transition ${answers[idx] === ci ? 'border-beni bg-blush' : 'border-blush bg-white hover:border-sakura'}`}>{c}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Back</button>
        {idx < quiz.questions.length - 1 && <button className="btn-ghost" onClick={() => setIdx(idx + 1)}>Next →</button>}
        <button className="btn-primary ml-auto" disabled={!done || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit answers'}</button>
      </div>
      <ErrorBanner message={error} />
    </div>
  );
}
