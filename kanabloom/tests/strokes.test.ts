import { describe, expect, it } from 'vitest';
import strokes from '../src/content/kana-strokes.json';
import { pathToPoints, referenceFromPaths, resample, scoreWriting, strokeLength, validateDrawnStrokes, type Stroke } from '../src/lib/strokes';

const S = strokes as Record<string, string[]>;
const jitter = (s: Stroke[], amt: number, seed = 1): Stroke[] => {
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return (x / 2147483647 - 0.5) * 2 * amt; };
  return s.map((st) => st.map(([a, b]) => [a + rnd(), b + rnd()] as [number, number]));
};

describe('stroke data', () => {
  it('has correct stroke counts for known characters', () => {
    const expected: Record<string, number> = { 'あ': 3, 'い': 2, 'う': 2, 'き': 4, 'し': 1, 'ん': 1, 'を': 3, 'ア': 2, 'キ': 3, 'シ': 3, 'ン': 2, 'ヲ': 3 };
    for (const [c, n] of Object.entries(expected)) expect(S[c]).toHaveLength(n);
  });
  it('covers all 92 kana and every path parses inside the 109 box', () => {
    expect(Object.keys(S)).toHaveLength(92);
    for (const paths of Object.values(S)) for (const d of paths) {
      const pts = pathToPoints(d);
      expect(pts.length).toBeGreaterThan(1);
      expect(strokeLength(pts)).toBeGreaterThan(3);
      pts.forEach(([x, y]) => { expect(x).toBeGreaterThan(-5); expect(x).toBeLessThan(114); expect(y).toBeGreaterThan(-5); expect(y).toBeLessThan(114); });
    }
  });
  it('resamples to evenly spaced points', () => {
    const r = resample([[0, 0], [10, 0]], 11);
    expect(r).toHaveLength(11);
    expect(r[5][0]).toBeCloseTo(5, 5);
  });
});

describe('writing scoring', () => {
  const ref = referenceFromPaths(S['あ']);
  it('a faithful copy scores very high', () => {
    expect(scoreWriting(ref, ref).accuracy).toBeGreaterThanOrEqual(98);
  });
  it('slightly shaky handwriting still scores well', () => {
    expect(scoreWriting(ref, jitter(ref, 2)).accuracy).toBeGreaterThanOrEqual(80);
  });
  it('missing strokes lose points and are reported', () => {
    const r = scoreWriting(ref, ref.slice(0, 2));
    expect(r.accuracy).toBeLessThan(75);
    expect(r.feedback.join(' ')).toMatch(/2 of 3 strokes/);
  });
  it('extra strokes are penalised', () => {
    const r = scoreWriting(ref, [...ref, [[10, 10], [90, 90]]]);
    expect(r.accuracy).toBeLessThan(90);
    expect(r.feedback.join(' ')).toMatch(/extra stroke/);
  });
  it('a stroke drawn backwards is flagged and gets partial credit', () => {
    const rev = ref.map((s, i) => (i === 0 ? [...s].reverse() : s));
    const r = scoreWriting(ref, rev);
    expect(r.perStroke[0].issue).toBe('direction');
    expect(r.accuracy).toBeLessThan(90);
  });
  it('a correct character written off-centre or smaller still scores well', () => {
    const shifted = ref.map((st) => st.map(([x, y]) => [x + 15, y + 10] as [number, number]));
    const small = ref.map((st) => st.map(([x, y]) => [30 + x * 0.5, 30 + y * 0.5] as [number, number]));
    expect(scoreWriting(ref, shifted).accuracy).toBeGreaterThanOrEqual(95);
    expect(scoreWriting(ref, small).accuracy).toBeGreaterThanOrEqual(95);
  });
  it('a similar-looking character (お vs あ) scores low', () => {
    expect(scoreWriting(ref, referenceFromPaths(S['お'])).accuracy).toBeLessThan(40);
  });
  it('a different character scores low', () => {
    const other = referenceFromPaths(S['ぬ']).slice(0, 3);
    expect(scoreWriting(ref, other).accuracy).toBeLessThan(55);
  });
  it('scribbles score near zero', () => {
    expect(scoreWriting(ref, [[[5, 100], [6, 101]], [[100, 5], [101, 4]], [[2, 2], [3, 3]]]).accuracy).toBeLessThan(15);
  });
  it('validates stroke payloads', () => {
    expect(validateDrawnStrokes([[[1, 2], [3, 4]]])).toBe(true);
    expect(validateDrawnStrokes([])).toBe(false);
    expect(validateDrawnStrokes([[[1, 'x']]])).toBe(false);
    expect(validateDrawnStrokes([[[1, 9999]]])).toBe(false);
    expect(validateDrawnStrokes(Array.from({ length: 21 }, () => [[1, 1]]))).toBe(false);
  });
});
