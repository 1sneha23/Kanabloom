// Stroke geometry: parse KanjiVG-style SVG path data into point lists,
// resample, and score a learner's handwriting against the reference strokes.
// Pure functions with no DOM dependency, so they run in the browser, in Node tests,
// and in the Deno edge function that records the official writing score.

export type Pt = [number, number];
export type Stroke = Pt[];

/** Parse SVG path data (M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t, Z/z) into a polyline. */
export function pathToPoints(d: string, stepsPerCurve = 12): Stroke {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const pts: Stroke = [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
  let lastCtrl: Pt | null = null, lastCmd = '';
  const num = () => parseFloat(tokens[i++]);
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    for (let s = 1; s <= stepsPerCurve; s++) {
      const t = s / stepsPerCurve, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'M') {
      cx = ox + num(); cy = oy + num(); sx = cx; sy = cy; pts.push([cx, cy]);
      cmd = rel ? 'l' : 'L'; lastCtrl = null;
    } else if (C === 'L') {
      cx = ox + num(); cy = oy + num(); pts.push([cx, cy]); lastCtrl = null;
    } else if (C === 'H') {
      cx = (rel ? cx : 0) + num(); pts.push([cx, cy]); lastCtrl = null;
    } else if (C === 'V') {
      cy = (rel ? cy : 0) + num(); pts.push([cx, cy]); lastCtrl = null;
    } else if (C === 'C') {
      const p1: Pt = [ox + num(), oy + num()], p2: Pt = [ox + num(), oy + num()], p3: Pt = [ox + num(), oy + num()];
      cubic([cx, cy], p1, p2, p3); lastCtrl = p2; cx = p3[0]; cy = p3[1];
    } else if (C === 'S') {
      const p1: Pt = lastCtrl && /[CcSs]/.test(lastCmd) ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy];
      const p2: Pt = [ox + num(), oy + num()], p3: Pt = [ox + num(), oy + num()];
      cubic([cx, cy], p1, p2, p3); lastCtrl = p2; cx = p3[0]; cy = p3[1];
    } else if (C === 'Q' || C === 'T') {
      let q: Pt;
      if (C === 'Q') q = [ox + num(), oy + num()];
      else q = lastCtrl && /[QqTt]/.test(lastCmd) ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy];
      const p3: Pt = [ox + num(), oy + num()];
      const p0: Pt = [cx, cy];
      cubic(p0, [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])],
        [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3);
      lastCtrl = q; cx = p3[0]; cy = p3[1];
    } else if (C === 'Z') {
      cx = sx; cy = sy; pts.push([cx, cy]); lastCtrl = null;
    } else {
      i++; // unknown token — skip defensively
    }
    lastCmd = cmd;
  }
  return pts;
}

export function strokeLength(s: Stroke): number {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return L;
}

/** Resample a polyline to n evenly spaced points. */
export function resample(s: Stroke, n = 24): Stroke {
  if (s.length === 0) return [];
  if (s.length === 1) return Array.from({ length: n }, () => [s[0][0], s[0][1]] as Pt);
  const total = strokeLength(s);
  if (total === 0) return Array.from({ length: n }, () => [s[0][0], s[0][1]] as Pt);
  const step = total / (n - 1);
  const out: Stroke = [[s[0][0], s[0][1]]];
  let acc = 0;
  for (let i = 1; i < s.length && out.length < n; i++) {
    let [px, py] = s[i - 1];
    const [qx, qy] = s[i];
    let seg = Math.hypot(qx - px, qy - py);
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const nx = px + t * (qx - px), ny = py + t * (qy - py);
      out.push([nx, ny]);
      seg -= step - acc; px = nx; py = ny; acc = 0;
    }
    acc += seg;
  }
  while (out.length < n) out.push([s[s.length - 1][0], s[s.length - 1][1]]);
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
/** Compact reference format stored in characters.stroke_points (KanjiVG 109×109 space). */
export function referenceFromPaths(paths: string[], n = 24): Stroke[] {
  return paths.map((d) => resample(pathToPoints(d), n).map(([x, y]) => [round1(x), round1(y)] as Pt));
}

export interface StrokeFeedback { index: number; score: number; issue?: 'shape' | 'direction' | 'position' }
export interface WritingScore {
  accuracy: number;          // 0–100
  strokeCountExpected: number;
  strokeCountDrawn: number;
  perStroke: StrokeFeedback[];
  feedback: string[];
}

/**
 * Score handwriting against reference strokes.
 * Both inputs must be in the same coordinate space (the 109×109 KanjiVG box);
 * the canvas maps pointer coordinates into that space before calling this.
 * Each drawn stroke is compared in order with the reference stroke of the same index:
 * mean point distance (shape + position), with a reversed-direction check.
 */
export function scoreWriting(reference: Stroke[], drawn: Stroke[], box = 109): WritingScore {
  const n = 24;
  const feedback: string[] = [];
  const ref = reference.map((s) => resample(s, n));
  // Normalise overall placement and size: a correct character written small or off-centre is still correct.
  // Relative stroke positions inside the character still matter.
  const usr = normaliseTo(drawn.filter((s) => s.length > 0), ref).map((s) => resample(s, n));
  const perStroke: StrokeFeedback[] = [];
  // Distance tolerance: ~22% of the box means "unrecognisable"; ~4% is excellent.
  const good = box * 0.04, bad = box * 0.22;
  const toScore = (dist: number) => Math.max(0, Math.min(1, (bad - dist) / (bad - good)));
  const meanDist = (a: Stroke, b: Stroke) => a.reduce((sum, p, i) => sum + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

  for (let i = 0; i < ref.length; i++) {
    const u = usr[i];
    if (!u) { perStroke.push({ index: i, score: 0 }); continue; }
    const fwd = meanDist(u, ref[i]);
    const rev = meanDist([...u].reverse(), ref[i]);
    let s = toScore(fwd);
    let issue: StrokeFeedback['issue'];
    if (rev + good < fwd && toScore(rev) > s) {
      // Right shape drawn the wrong way: partial credit only.
      s = toScore(rev) * 0.5; issue = 'direction';
    } else if (s < 0.6) {
      // Distinguish "right shape, wrong place" from "wrong shape".
      const cRef = centroid(ref[i]), cUsr = centroid(u);
      const shifted = u.map(([x, y]) => [x - cUsr[0] + cRef[0], y - cUsr[1] + cRef[1]] as Pt);
      issue = toScore(meanDist(shifted, ref[i])) > s + 0.25 ? 'position' : 'shape';
    }
    perStroke.push({ index: i, score: round1(s * 100), issue });
  }

  const strokeAvg = ref.length ? perStroke.reduce((a, b) => a + b.score, 0) / ref.length : 0;
  const extra = Math.max(0, usr.length - ref.length);
  const countPenalty = Math.min(40, extra * 15);
  const accuracy = Math.max(0, Math.round(strokeAvg - countPenalty));

  if (usr.length < ref.length) feedback.push(`You drew ${usr.length} of ${ref.length} strokes.`);
  if (extra > 0) feedback.push(`You drew ${extra} extra stroke${extra > 1 ? 's' : ''}. This character has ${ref.length}.`);
  perStroke.forEach((p) => {
    if (p.issue === 'direction') feedback.push(`Stroke ${p.index + 1} was drawn in the wrong direction.`);
    else if (p.issue === 'position') feedback.push(`Stroke ${p.index + 1} has the right shape but is in the wrong place.`);
    else if (p.issue === 'shape') feedback.push(`Stroke ${p.index + 1} does not match the expected shape yet.`);
  });
  if (feedback.length === 0) feedback.push(accuracy >= 85 ? 'Beautiful! Stroke order and shape look great.' : 'Good effort — keep practising for smoother strokes.');

  return { accuracy, strokeCountExpected: ref.length, strokeCountDrawn: usr.length, perStroke, feedback };
}

function bbox(strokes: Stroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Uniformly scale and translate the drawn strokes so their bounding box matches the reference's. */
export function normaliseTo(drawn: Stroke[], reference: Stroke[]): Stroke[] {
  if (drawn.length === 0 || reference.length === 0) return drawn;
  const a = bbox(drawn), b = bbox(reference);
  const da = Math.max(a.w, a.h), db = Math.max(b.w, b.h);
  if (!(da > 1) || !(db > 1)) return drawn;               // a dot: nothing meaningful to normalise
  const k = Math.min(3, Math.max(1 / 3, db / da));        // clamp so wildly wrong sizes are not "rescued"
  return drawn.map((s) => s.map(([x, y]) => [b.cx + (x - a.cx) * k, b.cy + (y - a.cy) * k] as Pt));
}

function centroid(s: Stroke): Pt {
  const x = s.reduce((a, p) => a + p[0], 0) / s.length;
  const y = s.reduce((a, p) => a + p[1], 0) / s.length;
  return [x, y];
}

/** Basic sanity limits so the server never processes absurd payloads. */
export function validateDrawnStrokes(drawn: unknown): drawn is Stroke[] {
  if (!Array.isArray(drawn) || drawn.length === 0 || drawn.length > 20) return false;
  return drawn.every((s) => Array.isArray(s) && s.length >= 1 && s.length <= 2000 &&
    s.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -50 && v <= 160)));
}
