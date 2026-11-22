// Strict no-Kanji validator.
// The same character ranges are enforced in the database by public.find_kanji()
// (supabase/migrations/0003_functions.sql), so the browser check is a convenience —
// the database is the real gate. Invalid characters are never stripped or replaced.

// CJK ideographs and Kanji-only marks:
//  U+2E80–U+2FDF  CJK radicals supplement + Kangxi radicals
//  U+3005–U+3007  々 〆 〇 (iteration mark, shime, ideographic zero)
//  U+3021–U+3029, U+3038–U+303B  Hangzhou numerals, extra iteration marks
//  U+3400–U+4DBF  CJK Extension A
//  U+4E00–U+9FFF  CJK Unified Ideographs
//  U+F900–U+FAFF  CJK Compatibility Ideographs
//  U+20000–U+3134F CJK Extensions B–G
export const KANJI_PATTERN =
  /[⺀-⿟々-〇〡-〩〸-〻㐀-䶿一-鿿豈-﫿\u{20000}-\u{3134F}]/u;
const KANJI_GLOBAL = new RegExp(KANJI_PATTERN.source, 'gu');

export function containsKanji(text: string): boolean {
  return KANJI_PATTERN.test(text);
}

export interface KanjiViolation {
  path: string;      // e.g. "content.items[2].example.jp"
  chars: string[];   // unique offending characters, in order of appearance
  snippet: string;   // the full offending string, truncated
}

/** Recursively scans any value (string, array, object) and reports every field containing Kanji. */
export function findKanji(value: unknown, path = ''): KanjiViolation[] {
  const out: KanjiViolation[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      const matches = v.match(KANJI_GLOBAL);
      if (matches) {
        out.push({ path: p || '(value)', chars: [...new Set(matches)], snippet: v.length > 80 ? v.slice(0, 77) + '…' : v });
      }
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) walk(child, p ? `${p}.${k}` : k);
    }
  };
  walk(value, path);
  return out;
}

export function formatViolations(v: KanjiViolation[]): string {
  return v.map((x) => `${x.path}: contains Kanji ${x.chars.join(' ')} in "${x.snippet}"`).join('\n');
}
