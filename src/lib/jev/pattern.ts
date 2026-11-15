/**
 * Safe patterns for Jev `matches` conditions and spec question
 * `validation.pattern`. A vetted subset of JavaScript regular expressions
 * (u-mode syntax), parsed here and run by a linear-time matcher (a Pike VM:
 * every position is visited once per program step, no backtracking), so no
 * pattern can hang the server on a long answer.
 *
 * Allowed: literals; escaped syntax characters; \d \D \w \W \s \S \p{..} \P{..};
 * \t \n \r \v \f \0 \xHH \uHHHH \u{H..}; `.`; classes [...] and [^...]; groups
 * (...) and (?:...); `|`; ^ $ \b \B; quantifiers * + ? {n} {n,} {n,m} (and
 * their lazy forms, which never change whether a value matches).
 * Refused (checkPattern): more than 200 characters; anything that does not
 * compile as a JavaScript u-mode RegExp; back-references; lookahead and
 * lookbehind; named groups; \c escapes; nested quantifiers (a repeating
 * quantifier on a group that holds a quantifier or an alternation); repeat
 * counts above 500; and patterns that expand past 2,000 matcher steps.
 * Patterns are unanchored like RegExp.test: write ^ and $ to match the whole
 * value. There are no flags (so never g or y, and no i).
 */

export const PATTERN_MAX_LENGTH = 200;
const MAX_REPEAT = 500;
const MAX_PROGRAM = 2000;
/** Values longer than this never match (answers are capped at 2,000 characters). */
const MAX_INPUT = 5000;

export type PatternCheck = { ok: true } | { ok: false; message: string };

type AssertKind = 'start' | 'end' | 'word' | 'not_word';
type CharTest = (cp: number) => boolean;

type PatternNode =
  | { t: 'empty' }
  | { t: 'char'; cp: number }
  | { t: 'set'; test: CharTest }
  | { t: 'assert'; kind: AssertKind }
  | { t: 'seq'; items: PatternNode[] }
  | { t: 'alt'; options: PatternNode[] }
  | { t: 'group'; body: PatternNode; risky: boolean }
  | { t: 'repeat'; body: PatternNode; min: number; max: number };

type Inst =
  | { op: 'char'; cp: number }
  | { op: 'set'; test: CharTest }
  | { op: 'split'; x: number; y: number }
  | { op: 'jmp'; x: number }
  | { op: 'assert'; kind: AssertKind }
  | { op: 'match' };

class PatternError extends Error {}

const SYNTAX_CHARS = new Set(Array.from('^$\\.*+?()[]{}|/', (c) => c.codePointAt(0) as number));
const LINE_TERMINATORS = new Set([0x0a, 0x0d, 0x2028, 0x2029]);
const CONTROL_ESCAPES: Record<string, number> = { t: 9, n: 10, v: 11, f: 12, r: 13 };

function isDigit(cp: number | undefined): boolean {
  return cp !== undefined && cp >= 48 && cp <= 57;
}

function isHex(cp: number | undefined): boolean {
  return cp !== undefined && (isDigit(cp) || (cp >= 65 && cp <= 70) || (cp >= 97 && cp <= 102));
}

function isWordChar(cp: number | undefined): boolean {
  return cp !== undefined && (isDigit(cp) || (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122) || cp === 95);
}

/** A one-character test delegated to the JavaScript engine (safe: it only ever sees one code point). */
function jsCharTest(source: string): CharTest {
  let re: RegExp;
  try {
    re = new RegExp(`^${source}$`, 'u');
  } catch {
    throw new PatternError(`${source} isn't a valid character class or escape`);
  }
  const memo = new Map<number, boolean>();
  return (cp) => {
    let hit = memo.get(cp);
    if (hit === undefined) {
      hit = re.test(String.fromCodePoint(cp));
      memo.set(cp, hit);
    }
    return hit;
  };
}

function hasRisk(node: PatternNode): boolean {
  switch (node.t) {
    case 'repeat':
    case 'alt':
      return true;
    case 'seq':
      return node.items.some(hasRisk);
    case 'group':
      return node.risky;
    default:
      return false;
  }
}

class Parser {
  private i = 0;
  private readonly cps: number[];

  constructor(source: string) {
    this.cps = Array.from(source, (c) => c.codePointAt(0) as number);
  }

  parse(): PatternNode {
    const node = this.disjunction();
    if (this.i < this.cps.length) throw new PatternError('There is a ) without a matching (');
    return node;
  }

  private peek(offset = 0): number | undefined {
    return this.cps[this.i + offset];
  }

  private is(ch: string, offset = 0): boolean {
    return this.peek(offset) === ch.codePointAt(0);
  }

  private disjunction(): PatternNode {
    const options = [this.alternative()];
    while (this.is('|')) {
      this.i++;
      options.push(this.alternative());
    }
    return options.length === 1 ? options[0] : { t: 'alt', options };
  }

  private alternative(): PatternNode {
    const items: PatternNode[] = [];
    while (this.i < this.cps.length && !this.is('|') && !this.is(')')) items.push(this.term());
    if (items.length === 0) return { t: 'empty' };
    return items.length === 1 ? items[0] : { t: 'seq', items };
  }

  private term(): PatternNode {
    let assertion: AssertKind | null = null;
    if (this.is('^')) assertion = 'start';
    else if (this.is('$')) assertion = 'end';
    else if (this.is('\\') && this.is('b', 1)) assertion = 'word';
    else if (this.is('\\') && this.is('B', 1)) assertion = 'not_word';
    if (assertion) {
      this.i += assertion === 'start' || assertion === 'end' ? 1 : 2;
      if (this.atQuantifier()) throw new PatternError('A quantifier needs a character or group to repeat');
      return { t: 'assert', kind: assertion };
    }
    const atom = this.atom();
    const q = this.quantifier();
    if (!q) return atom;
    if (this.is('?')) this.i++;
    if (this.atQuantifier()) throw new PatternError('A quantifier cannot follow another quantifier');
    if (q.max > 1 && atom.t === 'group' && atom.risky) {
      throw new PatternError('Nested quantifiers are not allowed: a repeated group cannot hold a quantifier or |');
    }
    return { t: 'repeat', body: atom, min: q.min, max: q.max };
  }

  private atQuantifier(): boolean {
    return this.is('*') || this.is('+') || this.is('?') || this.is('{');
  }

  private quantifier(): { min: number; max: number } | null {
    if (this.is('*') || this.is('+') || this.is('?')) {
      const c = this.cps[this.i++];
      return c === 42 ? { min: 0, max: Infinity } : c === 43 ? { min: 1, max: Infinity } : { min: 0, max: 1 };
    }
    if (!this.is('{')) return null;
    this.i++;
    const min = this.number();
    let max = min;
    if (this.is(',')) {
      this.i++;
      max = this.is('}') ? Infinity : this.number();
    }
    if (!this.is('}')) throw new PatternError('Write a repeat count as {n}, {n,} or {n,m}');
    this.i++;
    if (max < min) throw new PatternError('In {n,m}, n must not be larger than m');
    if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) {
      throw new PatternError(`Repeat counts above ${MAX_REPEAT} are not supported`);
    }
    return { min, max };
  }

  private number(): number {
    const start = this.i;
    while (isDigit(this.peek())) this.i++;
    if (this.i === start) throw new PatternError('Write a repeat count as {n}, {n,} or {n,m}');
    const text = String.fromCodePoint(...this.cps.slice(start, this.i));
    return text.length > 6 ? Number.MAX_SAFE_INTEGER : Number(text);
  }

  private atom(): PatternNode {
    const cp = this.peek() as number;
    const ch = String.fromCodePoint(cp);
    if (ch === '.') {
      this.i++;
      return { t: 'set', test: (c) => !LINE_TERMINATORS.has(c) };
    }
    if (ch === '(') return this.group();
    if (ch === '[') return this.charClass();
    if (ch === '\\') return this.escape();
    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      throw new PatternError('A quantifier needs a character or group to repeat');
    }
    if (ch === ']' || ch === '}') throw new PatternError(`Write ${ch} as \\${ch}`);
    this.i++;
    return { t: 'char', cp };
  }

  private group(): PatternNode {
    this.i++;
    if (this.is('?')) {
      if (this.is(':', 1)) {
        this.i += 2;
      } else if (this.is('=', 1) || this.is('!', 1) || (this.is('<', 1) && (this.is('=', 2) || this.is('!', 2)))) {
        throw new PatternError('Lookahead and lookbehind are not allowed');
      } else if (this.is('<', 1)) {
        throw new PatternError('Named groups are not supported: use (...) or (?:...)');
      } else {
        throw new PatternError('Unsupported group: use (...) or (?:...)');
      }
    }
    const body = this.disjunction();
    if (!this.is(')')) throw new PatternError('A ( is missing its )');
    this.i++;
    return { t: 'group', body, risky: hasRisk(body) };
  }

  private charClass(): PatternNode {
    const start = this.i;
    this.i++;
    if (this.is('^')) this.i++;
    while (this.i < this.cps.length && !this.is(']')) {
      if (this.is('\\')) {
        const next = this.peek(1);
        if (isDigit(next) && next !== 48) throw new PatternError('Back-references are not allowed');
        this.i += 2;
      } else {
        this.i++;
      }
    }
    if (!this.is(']')) throw new PatternError('A [ is missing its ]');
    this.i++;
    return { t: 'set', test: jsCharTest(String.fromCodePoint(...this.cps.slice(start, this.i))) };
  }

  private escape(): PatternNode {
    const next = this.peek(1);
    if (next === undefined) throw new PatternError('A pattern cannot end with \\');
    const ch = String.fromCodePoint(next);
    this.i += 2;
    if ('dDwWsS'.includes(ch)) return { t: 'set', test: jsCharTest(`\\${ch}`) };
    if (ch === 'p' || ch === 'P') {
      if (!this.is('{')) throw new PatternError(`Write \\${ch} as \\${ch}{Name}`);
      const close = this.cps.indexOf(125, this.i);
      if (close < 0) throw new PatternError(`Write \\${ch} as \\${ch}{Name}`);
      const body = String.fromCodePoint(...this.cps.slice(this.i, close + 1));
      this.i = close + 1;
      return { t: 'set', test: jsCharTest(`\\${ch}${body}`) };
    }
    if (isDigit(next) && next !== 48) throw new PatternError('Back-references are not allowed');
    if (ch === 'k') throw new PatternError('Back-references are not allowed');
    if (ch === 'c') throw new PatternError('\\c escapes are not supported');
    if (ch === '0') {
      if (isDigit(this.peek())) throw new PatternError('Back-references are not allowed');
      return { t: 'char', cp: 0 };
    }
    if (ch in CONTROL_ESCAPES) return { t: 'char', cp: CONTROL_ESCAPES[ch] };
    if (ch === 'x') return { t: 'char', cp: this.hex(2) };
    if (ch === 'u') return { t: 'char', cp: this.unicodeEscape() };
    if (SYNTAX_CHARS.has(next)) return { t: 'char', cp: next };
    throw new PatternError(`\\${ch} is not a valid escape here`);
  }

  private hex(count: number): number {
    let value = 0;
    for (let k = 0; k < count; k++) {
      const cp = this.peek();
      if (!isHex(cp)) throw new PatternError('Write \\x as \\xHH and \\u as \\uHHHH or \\u{H...}');
      value = value * 16 + parseInt(String.fromCodePoint(cp as number), 16);
      this.i++;
    }
    return value;
  }

  private unicodeEscape(): number {
    if (this.is('{')) {
      this.i++;
      let value = 0;
      let digits = 0;
      while (isHex(this.peek())) {
        value = value * 16 + parseInt(String.fromCodePoint(this.cps[this.i++]), 16);
        digits++;
        if (value > 0x10ffff) throw new PatternError('\\u{...} is above U+10FFFF');
      }
      if (digits === 0 || !this.is('}')) throw new PatternError('Write \\u as \\uHHHH or \\u{H...}');
      this.i++;
      return value;
    }
    const high = this.hex(4);
    if (high >= 0xd800 && high <= 0xdbff && this.is('\\') && this.is('u', 1)) {
      const save = this.i;
      this.i += 2;
      if ([0, 1, 2, 3].every((k) => isHex(this.peek(k)))) {
        const low = this.hex(4);
        if (low >= 0xdc00 && low <= 0xdfff) return 0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00);
      }
      this.i = save;
    }
    return high;
  }
}

class ProgramBuilder {
  readonly prog: Inst[] = [];

  push(inst: Inst): number {
    if (this.prog.length >= MAX_PROGRAM) throw new PatternError('This pattern is too complex: make it shorter or use smaller repeat counts');
    this.prog.push(inst);
    return this.prog.length - 1;
  }

  emit(node: PatternNode): void {
    switch (node.t) {
      case 'empty':
        return;
      case 'char':
        this.push({ op: 'char', cp: node.cp });
        return;
      case 'set':
        this.push({ op: 'set', test: node.test });
        return;
      case 'assert':
        this.push({ op: 'assert', kind: node.kind });
        return;
      case 'seq':
        node.items.forEach((item) => this.emit(item));
        return;
      case 'group':
        this.emit(node.body);
        return;
      case 'alt': {
        const exits: number[] = [];
        node.options.forEach((option, k) => {
          if (k === node.options.length - 1) {
            this.emit(option);
            return;
          }
          const split = this.push({ op: 'split', x: this.prog.length + 1, y: -1 });
          this.emit(option);
          exits.push(this.push({ op: 'jmp', x: -1 }));
          (this.prog[split] as { y: number }).y = this.prog.length;
        });
        exits.forEach((j) => ((this.prog[j] as { x: number }).x = this.prog.length));
        return;
      }
      case 'repeat': {
        for (let k = 0; k < node.min; k++) this.emit(node.body);
        if (node.max === Infinity) {
          const split = this.push({ op: 'split', x: this.prog.length + 1, y: -1 });
          this.emit(node.body);
          this.push({ op: 'jmp', x: split });
          (this.prog[split] as { y: number }).y = this.prog.length;
          return;
        }
        const splits: number[] = [];
        for (let k = node.min; k < node.max; k++) {
          splits.push(this.push({ op: 'split', x: this.prog.length + 1, y: -1 }));
          this.emit(node.body);
        }
        splits.forEach((s) => ((this.prog[s] as { y: number }).y = this.prog.length));
      }
    }
  }
}

function holds(kind: AssertKind, input: number[], pos: number): boolean {
  switch (kind) {
    case 'start':
      return pos === 0;
    case 'end':
      return pos === input.length;
    case 'word':
      return isWordChar(input[pos - 1]) !== isWordChar(input[pos]);
    case 'not_word':
      return isWordChar(input[pos - 1]) === isWordChar(input[pos]);
  }
}

/** Does `prog` match anywhere in `input` (RegExp.test semantics)? O(input x program). */
function run(prog: Inst[], input: number[]): boolean {
  const mark = new Int32Array(prog.length);
  let gen = 1;
  let matched = false;
  let current: number[] = [];
  let next: number[] = [];
  const stack: number[] = [];
  const add = (list: number[], start: number, pos: number) => {
    stack.push(start);
    while (stack.length > 0) {
      const pc = stack.pop() as number;
      if (mark[pc] === gen) continue;
      mark[pc] = gen;
      const inst = prog[pc];
      if (inst.op === 'jmp') stack.push(inst.x);
      else if (inst.op === 'split') stack.push(inst.y, inst.x);
      else if (inst.op === 'assert') {
        if (holds(inst.kind, input, pos)) stack.push(pc + 1);
      } else if (inst.op === 'match') matched = true;
      else list.push(pc);
    }
  };
  add(current, 0, 0);
  for (let pos = 0; ; pos++) {
    if (matched) return true;
    if (pos >= input.length) return false;
    const cp = input[pos];
    gen++;
    next.length = 0;
    for (const pc of current) {
      const inst = prog[pc];
      if ((inst.op === 'char' && inst.cp === cp) || (inst.op === 'set' && inst.test(cp))) add(next, pc + 1, pos + 1);
    }
    add(next, 0, pos + 1);
    [current, next] = [next, current];
  }
}

type Compiled = { ok: true; prog: Inst[] } | { ok: false; message: string };
const cache = new Map<string, Compiled>();

function compile(pattern: string): Compiled {
  const hit = cache.get(pattern);
  if (hit) return hit;
  let result: Compiled;
  if (typeof pattern !== 'string' || pattern.length === 0) {
    result = { ok: false, message: 'A pattern cannot be empty' };
  } else if (pattern.length > PATTERN_MAX_LENGTH) {
    result = { ok: false, message: `A pattern can be at most ${PATTERN_MAX_LENGTH} characters` };
  } else {
    try {
      new RegExp(pattern, 'u');
      const builder = new ProgramBuilder();
      builder.emit(new Parser(pattern).parse());
      builder.push({ op: 'match' });
      result = { ok: true, prog: builder.prog };
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof PatternError ? error.message : 'This is not a valid pattern',
      };
    }
  }
  if (cache.size >= 500) cache.clear();
  cache.set(pattern, result);
  return result;
}

/** Whether staff may use `pattern` (in a Jev `matches` condition or a question's validation.pattern). */
export function checkPattern(pattern: string): PatternCheck {
  const compiled = compile(pattern);
  return compiled.ok ? { ok: true } : { ok: false, message: compiled.message };
}

/**
 * Whether `value` matches `pattern` anywhere (like RegExp.test; anchor with ^
 * and $). Null when the pattern is not allowed (checkPattern explains why).
 */
export function testPattern(pattern: string, value: string): boolean | null {
  const compiled = compile(pattern);
  if (!compiled.ok) return null;
  const input = Array.from(value, (c) => c.codePointAt(0) as number);
  if (input.length > MAX_INPUT) return false;
  return run(compiled.prog, input);
}
