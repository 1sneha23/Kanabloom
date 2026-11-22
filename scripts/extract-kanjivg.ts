// One-off: extract stroke paths for the 92 kana from a local KanjiVG checkout.
// Usage: npx tsx scripts/extract-kanjivg.ts /path/to/kanjivg/kanji
// Writes src/content/kana-strokes.json. KanjiVG © Ulrich Apel, CC BY-SA 3.0.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIRAGANA, KATAKANA } from '../src/content/kana';

const dir = process.argv[2];
if (!dir) throw new Error('Pass the KanjiVG kanji/ directory');
const out: Record<string, string[]> = {};
for (const k of [...HIRAGANA, ...KATAKANA]) {
  const hex = k.char.codePointAt(0)!.toString(16).padStart(5, '0');
  const svg = readFileSync(join(dir, `${hex}.svg`), 'utf8');
  // Stroke paths carry ids like kvg:03042-s1; order by the stroke number.
  const paths = [...svg.matchAll(/<path[^>]*id="kvg:[0-9a-f]+-s(\d+)"[^>]*\sd="([^"]+)"/g)]
    .map((m) => ({ n: Number(m[1]), d: m[2] }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.d);
  if (paths.length === 0) throw new Error(`No strokes for ${k.char}`);
  out[k.char] = paths;
}
writeFileSync('src/content/kana-strokes.json', JSON.stringify(out, null, 0));
console.log('wrote', Object.keys(out).length, 'characters');
