import { useEffect, useRef, useState } from 'react';
import { pathToPoints } from '../lib/strokes';

/**
 * Animated stroke order from KanjiVG path data (109×109 box).
 * Each stroke draws in sequence using stroke-dashoffset; numbered start points show order.
 */
export function StrokeOrder({ paths, size = 220, autoPlay = true, speed = 1 }: { paths: string[]; size?: number; autoPlay?: boolean; speed?: number }) {
  const [run, setRun] = useState(0);
  const refs = useRef<(SVGPathElement | null)[]>([]);
  const perStroke = 700 / speed, gap = 180 / speed;

  useEffect(() => {
    if (!autoPlay && run === 0) return;
    const timers: number[] = [];
    refs.current.forEach((el, i) => {
      if (!el) return;
      const len = el.getTotalLength?.() ?? 120;
      el.style.transition = 'none';
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      timers.push(window.setTimeout(() => {
        el.style.transition = `stroke-dashoffset ${perStroke}ms cubic-bezier(.4,0,.2,1)`;
        el.style.strokeDashoffset = '0';
      }, 60 + i * (perStroke + gap)));
    });
    return () => timers.forEach(clearTimeout);
  }, [run, paths, autoPlay, perStroke, gap]);

  const starts = paths.map((d) => pathToPoints(d, 2)[0] ?? [0, 0]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 109 109" width={size} height={size} className="rounded-3xl bg-white ring-1 ring-blush" aria-label={`Stroke order animation, ${paths.length} strokes`}>
        <line x1="54.5" y1="4" x2="54.5" y2="105" stroke="var(--color-blush)" strokeDasharray="3 3" />
        <line x1="4" y1="54.5" x2="105" y2="54.5" stroke="var(--color-blush)" strokeDasharray="3 3" />
        {paths.map((d, i) => <path key={`g${i}`} d={d} fill="none" stroke="var(--color-blush)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />)}
        {paths.map((d, i) => (
          <path key={`s${i}-${run}`} ref={(el) => { refs.current[i] = el; }} d={d} fill="none" stroke="var(--color-charcoal)"
                strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {starts.map(([x, y], i) => (
          <g key={`n${i}`}>
            <circle cx={x} cy={y} r="4.6" fill="var(--color-beni)" />
            <text x={x} y={y + 2.3} textAnchor="middle" fontSize="6.4" fill="white" fontFamily="sans-serif" fontWeight="700">{i + 1}</text>
          </g>
        ))}
      </svg>
      <button className="btn-soft !py-1.5 text-sm" onClick={() => setRun((r) => r + 1)}>↻ Replay strokes</button>
    </div>
  );
}
