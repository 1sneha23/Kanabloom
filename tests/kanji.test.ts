import { describe, expect, it } from 'vitest';
import { containsKanji, findKanji } from '../src/lib/kanji';
import { HIRAGANA, KATAKANA } from '../src/content/kana';
import { LESSONS, QUIZZES } from '../src/content/lessons';

describe('no-Kanji validator', () => {
  it('accepts hiragana, katakana, romaji, punctuation and the long-vowel mark', () => {
    expect(containsKanji('こんにちは、コーヒー！ Konnichiwa. ー・「」ヶ')).toBe(false);
  });
  it.each(['日', '本語', '私は学生です', '々', '〆', '〇', '𠮷', '⺀', '豈'])('rejects %s', (s) => {
    expect(containsKanji(s)).toBe(true);
  });
  it('reports every offending field path and character without altering input', () => {
    const doc = { title: 'ok', content: { items: [{ jp: 'はい' }, { jp: '日本', example: { jp: 'わたしは学生' } }] } };
    const before = JSON.stringify(doc);
    const v = findKanji(doc);
    expect(v.map((x) => x.path)).toEqual(['content.items[1].jp', 'content.items[1].example.jp']);
    expect(v[0].chars).toEqual(['日', '本']);
    expect(v[1].chars).toEqual(['学', '生']);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('all shipped course content is Kanji-free', () => {
    expect(findKanji({ HIRAGANA, KATAKANA, LESSONS, QUIZZES })).toEqual([]);
  });
});

describe('course content completeness', () => {
  it('has all 46 basic hiragana and 46 basic katakana, unique', () => {
    expect(HIRAGANA).toHaveLength(46);
    expect(KATAKANA).toHaveLength(46);
    expect(new Set(HIRAGANA.map((k) => k.char)).size).toBe(46);
    expect(new Set(KATAKANA.map((k) => k.char)).size).toBe(46);
    expect(HIRAGANA.map((k) => k.romaji)).toEqual(KATAKANA.map((k) => k.romaji));
    expect(HIRAGANA.every((k) => /^[ぁ-ゟ]$/.test(k.char))).toBe(true);
    expect(KATAKANA.every((k) => /^[゠-ヿ]$/.test(k.char))).toBe(true);
  });
  it('includes the 10 required greetings and 9 business words', () => {
    const g = LESSONS.find((l) => l.slug === 'basic-greetings')!.content.items.map((i) => i.jp);
    expect(g).toEqual(['おはようございます', 'こんにちは', 'こんばんは', 'ありがとうございます', 'すみません', 'はい', 'いいえ', 'さようなら', 'おやすみなさい', 'はじめまして']);
    const b = LESSONS.find((l) => l.slug === 'business-vocabulary')!.content.items.map((i) => i.jp);
    expect(b).toEqual(['かいしゃ', 'かいぎ', 'しゃいん', 'しゃちょう', 'しごと', 'でんわ', 'めいし', 'おきゃくさま', 'しつもん']);
  });
  it('every greeting has pronunciation, usage, example and a conversation', () => {
    const g = LESSONS.find((l) => l.slug === 'basic-greetings')!.content.items;
    g.forEach((i) => { expect(i.pronunciation && i.usage && i.example && i.conversation?.length).toBeTruthy(); });
  });
  it('quiz answer indexes are valid', () => {
    QUIZZES.forEach((q) => q.questions.forEach((x) => { expect(x.answer).toBeGreaterThanOrEqual(0); expect(x.answer).toBeLessThan(x.choices.length); }));
  });
  it('sentence builder answers use exactly the given tiles', () => {
    LESSONS.flatMap((l) => l.content.builder ?? []).forEach((b) => { expect([...b.answer].sort()).toEqual([...b.tiles].sort()); });
  });
});
