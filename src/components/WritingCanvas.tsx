import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character } from '../lib/types';
import { scoreWriting, type Stroke, type WritingScore } from '../lib/strokes';
import { supabase, errorMessage } from '../lib/supabase';
import { uuid } from '../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { ErrorBanner, Spinner } from './ui';

type Mode = 'trace' | 'free';

/**
 * Writing canvas: mouse, touch, finger and stylus via Pointer Events.
 * Coordinates are mapped into the 109×109 KanjiVG box so they can be compared with reference strokes.
 * The preview score is computed locally for instant feedback; the OFFICIAL score is computed again
 * on the server (score-writing edge function) and that is what gets saved.
 */
export function WritingCanvas({ character, onSaved }: { character: Character; onSaved?: (accuracy: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [mode, setMode] = useState<Mode>('trace');
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<WritingScore | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptId = useRef(uuid());
  const { markActive } = useAuth();

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const scale = c.width / 109;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // guide grid
    ctx.strokeStyle = '#FBE4EA'; ctx.lineWidth = 0.6; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(54.5, 3); ctx.lineTo(54.5, 106); ctx.moveTo(3, 54.5); ctx.lineTo(106, 54.5); ctx.stroke();
    ctx.setLineDash([]);
    // tracing guide
    if (mode === 'trace') {
      ctx.strokeStyle = '#F2C4CF'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      character.stroke_paths.forEach((d) => ctx.stroke(new Path2D(d)));
      // next-stroke hint
      const next = character.stroke_paths[strokes.current.length];
      if (next) { ctx.strokeStyle = '#E27D96'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.stroke(new Path2D(next)); ctx.setLineDash([]); }
    }
    // learner ink
    ctx.strokeStyle = '#2B2A2E'; ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [...strokes.current, ...(current.current ? [current.current] : [])].forEach((s) => {
      if (s.length === 0) return;
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
      s.forEach(([x, y]) => ctx.lineTo(x, y));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1] + 0.1);
      ctx.stroke();
    });
  }, [character, mode]);

  // Keep the canvas crisp and square at any size / device pixel ratio.
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current, w = wrapRef.current; if (!c || !w) return;
      const px = Math.min(w.clientWidth, 420);
      const dpr = window.devicePixelRatio || 1;
      c.style.width = `${px}px`; c.style.height = `${px}px`;
      c.width = Math.round(px * dpr); c.height = Math.round(px * dpr);
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { clear(); }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); }, [mode, draw]);

  const toBox = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 109, ((e.clientY - r.top) / r.height) * 109];
  };

  const onDown = (e: React.PointerEvent) => {
    if (result) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    current.current = [toBox(e)];
    markActive();
    draw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!current.current) return;
    const p = toBox(e);
    const last = current.current[current.current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.6) { current.current.push(p); draw(); }
  };
  const onUp = () => {
    if (!current.current) return;
    if (current.current.length > 0) strokes.current.push(current.current);
    current.current = null;
    setCount(strokes.current.length);
    draw();
  };

  function clear() {
    strokes.current = []; current.current = null; setCount(0);
    setResult(null); setSaved(null); setError(null);
    attemptId.current = uuid();
    draw();
  }
  const undo = () => { if (result) return; strokes.current.pop(); setCount(strokes.current.length); draw(); };

  const check = async () => {
    if (strokes.current.length === 0 || saving) return;
    const preview = scoreWriting(character.stroke_points, strokes.current);
    setResult(preview);
    setSaving(true); setError(null);
    try {
      const body = {
        character_id: character.id, client_attempt_id: attemptId.current, mode,
        strokes: strokes.current.map((s) => s.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])),
      };
      const { data, error } = await supabase.functions.invoke('score-writing', { body });
      if (error) throw error;
      setSaved(data.accuracy);
      setResult((r) => (r ? { ...r, accuracy: data.accuracy, feedback: data.feedback ?? r.feedback } : r));
      onSaved?.(data.accuracy);
    } catch (e) {
      setError(`Your attempt could not be saved: ${errorMessage(e)}. The score shown is a preview only.`);
    } finally {
      setSaving(false);
    }
  };

  const grade = result ? (result.accuracy >= 85 ? 'Excellent' : result.accuracy >= 70 ? 'Good' : result.accuracy >= 45 ? 'Getting there' : 'Try again') : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-blush p-1" role="tablist" aria-label="Practice mode">
          {(['trace', 'free'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); clear(); }}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === m ? 'bg-white text-beni shadow' : 'text-ink'}`}>
              {m === 'trace' ? 'Trace' : 'Write from memory'}
            </button>
          ))}
        </div>
        <span className="text-sm text-mist">Stroke {Math.min(count + 1, character.stroke_count)} of {character.stroke_count}</span>
      </div>

      <div ref={wrapRef} className="w-full max-w-[420px]">
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                className="touch-none select-none rounded-3xl bg-white shadow-[var(--shadow-soft)] ring-1 ring-blush"
                style={{ cursor: 'crosshair' }} aria-label={`Writing canvas for ${character.char}. Draw with mouse, finger or stylus.`} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={check} disabled={count === 0 || saving || !!result}>
          {saving ? <><Spinner className="h-4 w-4 text-white" /> Checking…</> : 'Check my writing'}
        </button>
        <button className="btn-soft" onClick={undo} disabled={count === 0 || !!result}>Undo stroke</button>
        <button className="btn-ghost" onClick={clear}>{result ? 'Retry' : 'Clear'}</button>
      </div>

      {result && (
        <div className="card animate-rise p-5" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-xl font-semibold">{grade}</span>
            <span className="font-display text-3xl font-semibold text-beni">{result.accuracy}%</span>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-ink">{result.feedback.map((f, i) => <li key={i}>• {f}</li>)}</ul>
          <div className="mt-3 text-xs text-mist">
            {saving ? 'Saving…' : saved !== null ? '✓ Saved to your progress' : error ? 'Not saved' : ''}
          </div>
        </div>
      )}
      <ErrorBanner message={error} />
    </div>
  );
}
