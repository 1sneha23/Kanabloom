import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCsv } from '../src/lib/csv';
import { formatDuration } from '../src/lib/format';
import { validatePassword } from '../src/pages/Auth';

describe('CSV export', () => {
  it('quotes commas/quotes/newlines and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: '=HYPERLINK("bad")', d: 'あいう' }]);
    expect(csv).toBe('a,b,c,d\r\n"x,y","say ""hi""","\'=HYPERLINK(""bad"")",あいう');
  });
});

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m');
    expect(formatDuration(3725)).toBe('1h 2m');
  });
});

describe('password rules', () => {
  it('requires 8+ chars with a letter and a number', () => {
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('allletters')).not.toBeNull();
    expect(validatePassword('sakura2026')).toBeNull();
  });
});

describe('security hygiene', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('browser code never references the service-role key', () => {
    for (const f of ['src/lib/supabase.ts', 'src/auth/AuthProvider.tsx', 'src/pages/admin/Content.tsx', 'src/pages/admin/Students.tsx']) {
      expect(src(f)).not.toMatch(/SERVICE_ROLE/);
    }
  });
  it('the seed file matches the content sources (regenerate with npm run gen:seed)', () => {
    const seed = src('supabase/seed.sql');
    expect((seed.match(/insert into public\.characters/g) ?? []).length).toBe(92);
    expect(seed).toContain('おはようございます');
    expect(seed).not.toMatch(/[一-鿿]/);
  });
  it('signup never trusts a role from user metadata', () => {
    const fn = src('supabase/migrations/20261121000002_functions.sql');
    const handle = fn.slice(fn.indexOf('function public.handle_new_user'), fn.indexOf('create trigger on_auth_user_created'));
    expect(handle).toContain("'learner'");
    expect(handle).not.toMatch(/raw_user_meta_data\s*->>\s*'role'/);
  });
});
