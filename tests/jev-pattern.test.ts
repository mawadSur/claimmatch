import { describe, expect, it } from 'vitest';
import { checkPattern, testPattern } from '@/lib/jev/pattern';

/** Patterns staff may use; each is also run against JavaScript's RegExp below. */
const ACCEPTED = [
  '^\\d{5}(-\\d{4})?$',
  '^[A-Z]{2}\\d{6}$',
  '^(?:Mr|Mrs|Ms)\\.? ',
  'a|b',
  '^(?:ab|cd)?e$',
  'x*y+z?',
  'x*?y+?z??',
  '^[^abc]+$',
  '\\bfoo\\b',
  '\\Bo',
  '^$',
  'colou?r',
  '[\\s\\S]{2,4}',
  '.',
  '^.{3}$',
  'a{2,}',
  'a{0,3}b',
  '^(?:a)*$',
  '^(?:[A-Z]\\d)+$',
  '(?:)',
  '\\u0041',
  '\\x41|\\u{1F600}',
  '[\\u00e0-\\u00ff]',
  '\\p{Lu}',
  '^\\P{L}+$',
  '😀+',
  '[😀-😂]{2}',
  '^\\w+@\\w+\\.\\w{2,}$',
  '^-?\\d+(?:\\.\\d{1,2})?$',
  '(?:^|,)x',
  'a$|^b',
  '\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/\\^\\$\\\\',
  '\\t|\\n|\\r|\\v|\\f|\\0',
  '[]',
  '[^]',
  '[-a]',
  '[a-]',
  '[\\-\\]]',
  '^\\p{L}[\\p{L} .\'-]*$',
  'é',
  'é',
  '^\\d*\\d*\\d*\\d*x$',
] as const;

describe('checkPattern', () => {
  it.each(ACCEPTED)('accepts %j', (pattern) => {
    expect(checkPattern(pattern)).toEqual({ ok: true });
  });

  it.each([
    ['', 'A pattern cannot be empty'],
    ['(a+)+', 'Nested quantifiers'],
    ['(a*)*', 'Nested quantifiers'],
    ['(\\d{3}-){2}', 'Nested quantifiers'],
    ['(?:a|aa)+b', 'Nested quantifiers'],
    ['((a+))*', 'Nested quantifiers'],
    ['(a)\\1', 'Back-references'],
    ['\\k<x>', 'This is not a valid pattern'],
    ['(?<x>a)\\k<x>', 'Named groups'],
    ['(?=a)', 'Lookahead and lookbehind'],
    ['(?!a)', 'Lookahead and lookbehind'],
    ['(?<=a)b', 'Lookahead and lookbehind'],
    ['(?<!a)b', 'Lookahead and lookbehind'],
    ['\\cJ', '\\c escapes'],
    ['a{1000}', 'Repeat counts above 500'],
    ['[a-z]{0,500}[a-z]{0,500}[a-z]{0,500}', 'This pattern is too complex'],
    ['[a-', 'This is not a valid pattern'],
    ['a{2,1}', 'This is not a valid pattern'],
    ['\\p{NotAProperty}', 'This is not a valid pattern'],
    ['a**', 'This is not a valid pattern'],
    ['\\-', 'This is not a valid pattern'],
    ['x'.repeat(201), 'at most 200 characters'],
  ])('refuses %j', (pattern, reason) => {
    const result = checkPattern(pattern);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(reason);
  });
});

/** Deterministic strings over an alphabet that exercises the corpus (letters, digits, accents, emoji, separators). */
function* samples(seed: number, count: number): Generator<string> {
  const alphabet = ['a', 'b', 'c', 'd', 'e', 'x', 'y', 'z', 'o', 'r', 'u', 'A', 'B', 'Z', 'M', 's', 'f', '1', '5', '0', '-', '.', '@', ' ', ',', '\n', '\t', '́', 'é', 'É', '😀', '😁', '\\', '$', '*'];
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
  };
  for (let i = 0; i < count; i++) {
    const length = next() % 9;
    let text = '';
    for (let k = 0; k < length; k++) text += alphabet[next() % alphabet.length];
    yield text;
  }
}

const TARGETED = ['', 'a', 'b', 'ab', 'cde', 'e', 'abe', 'cdd', '94110', '94110-1234', '94110-12', 'AB123456', 'Mr. Smith', 'Mrs X', 'foo bar', 'foobar', 'xyz', 'xyyz', 'color', 'colour', 'aaaa', 'aab', 'aaab', 'A1B2', 'A1B', 'A', 'é', 'é', '😀😀', '😀😂', 'ada@example.com', '-12.5', '12.345', ',x', 'x', 'b', '.*+?()[]{}|/^$\\', '\t', '\0', 'O\'Brien-Smith', '1111x', '1111'];

describe('testPattern matches exactly what JavaScript RegExp (u) matches', () => {
  it.each(ACCEPTED.map((p, i) => [p, i] as const))('%j', (pattern, i) => {
    const re = new RegExp(pattern, 'u');
    for (const value of [...TARGETED, ...samples(i + 1, 300)]) {
      expect([value, testPattern(pattern, value)]).toEqual([value, re.test(value)]);
    }
  });
});

describe('testPattern safety', () => {
  it('returns null for a pattern that is not allowed', () => {
    expect(testPattern('(a+)+$', 'aaaa')).toBeNull();
    expect(testPattern('(?=a)', 'a')).toBeNull();
  });

  it('runs in linear time on input that would hang a backtracking engine', () => {
    const started = performance.now();
    expect(testPattern('^\\d*\\d*\\d*\\d*x$', '1'.repeat(2000))).toBe(false);
    expect(testPattern('\\d*\\d*\\d*y', '9'.repeat(2000))).toBe(false);
    expect(testPattern('^(?:[ab])*c$', 'ab'.repeat(1000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('never matches beyond 5,000 characters', () => {
    expect(testPattern('a', 'b'.repeat(5000) + 'a')).toBe(false);
    expect(testPattern('a', 'b'.repeat(4000) + 'a')).toBe(true);
  });
});
