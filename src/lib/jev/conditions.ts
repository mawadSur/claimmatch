/**
 * Jev conditions (JevCondition, ./types.ts): evaluation and introspection.
 * Pure. Values come from a reader the caller supplies (./context.ts reads the
 * packet), so the same code serves runJev, spec visible_when and validation.
 *
 * Semantics (also in docs/designs/one-click-filing.md, section 7):
 * - Empty means undefined, null, a blank string or an empty list; for
 *   doc_count.<kind> it means 0. present / absent test emptiness.
 * - is_true / is_false: the value is exactly true / false (yes_no answers).
 * - eq / neq: strict equality; on a list (multi_choice) eq means "includes".
 * - in / not_in: the value (or, for a list, any item) is one of `values`.
 * - gt / gte / lt / lte: numbers, or decimal strings such as money "12.34".
 * - date_before / date_on_or_after: YYYY-MM-DD values.
 * - length_between: characters of a string or items of a list, inclusive.
 * - matches: a safe pattern (./pattern.ts) on a string or a whole number.
 * - eq_field: both fields hold equal values (lists equal item by item).
 * Every comparison is false when its value is empty or of another kind (a
 * document count is always a number, so doc_count.<kind> lt 1 holds at 0);
 * neq and not_in are then true. Write `when` with present to make a check
 * optional.
 */
import { numericValueOf, isIsoDate } from './formats';
import { checkPattern, testPattern } from './pattern';
import type { JevCondition } from './types';

/** What a Jev field can hold: answer values, the tier and payout keys, counts and the lane. */
export type JevValue = string | number | boolean | readonly string[] | null | undefined;
export type FieldReader = (field: string) => JevValue;

export const MAX_CONDITION_DEPTH = 6;
export const MAX_CONDITION_NODES = 50;

export function isEmptyValue(field: string, value: JevValue): boolean {
  if (field.startsWith('doc_count.')) return value === 0 || value === undefined || value === null;
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

type Leaf = Extract<JevCondition, { field: string }>;

function isLeaf(cond: JevCondition): cond is Leaf {
  return typeof (cond as { field?: unknown }).field === 'string';
}

function children(cond: JevCondition): JevCondition[] {
  if ('all' in cond) return cond.all;
  if ('any' in cond) return cond.any;
  if ('not' in cond) return [cond.not];
  return [];
}

function sameValue(a: JevValue, b: JevValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => item === b[i]);
  return a === b;
}

/** Whether a value can be compared: not empty, except that a document count of 0 is a real number. */
function comparable(field: string, value: JevValue): boolean {
  return field.startsWith('doc_count.') ? typeof value === 'number' : !isEmptyValue(field, value);
}

function evaluateLeaf(cond: Leaf, read: FieldReader): boolean {
  const value = read(cond.field);
  const empty = isEmptyValue(cond.field, value);
  const known = comparable(cond.field, value);
  switch (cond.op) {
    case 'present':
      return !empty;
    case 'absent':
      return empty;
    case 'is_true':
      return value === true;
    case 'is_false':
      return value === false;
    case 'eq':
    case 'neq': {
      const equal = Array.isArray(value) ? value.includes(cond.value as string) : known && value === cond.value;
      return cond.op === 'eq' ? equal : !equal;
    }
    case 'in':
    case 'not_in': {
      const values: readonly unknown[] = cond.values;
      const hit = Array.isArray(value)
        ? value.some((item) => values.includes(item))
        : known && values.includes(value);
      return cond.op === 'in' ? hit : !hit;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!known || Array.isArray(value)) return false;
      const n = numericValueOf(value);
      if (n === null) return false;
      if (cond.op === 'gt') return n > cond.value;
      if (cond.op === 'gte') return n >= cond.value;
      if (cond.op === 'lt') return n < cond.value;
      return n <= cond.value;
    }
    case 'date_before':
    case 'date_on_or_after': {
      if (typeof value !== 'string' || !isIsoDate(value) || !isIsoDate(cond.value)) return false;
      return cond.op === 'date_before' ? value < cond.value : value >= cond.value;
    }
    case 'length_between': {
      let length: number;
      if (typeof value === 'string') length = Array.from(value).length;
      else if (Array.isArray(value)) length = value.length;
      else return false;
      return length >= cond.min && length <= cond.max;
    }
    case 'matches': {
      let text: string;
      if (typeof value === 'string') text = value;
      else if (typeof value === 'number' && Number.isSafeInteger(value)) text = String(value);
      else return false;
      return testPattern(cond.pattern, text) === true;
    }
    case 'eq_field': {
      const other = read(cond.other);
      if (!known || !comparable(cond.other, other)) return false;
      return sameValue(value, other);
    }
    default:
      return false;
  }
}

/** Evaluates a condition against the reader's values. Never throws on a well-formed condition. */
export function evaluateCondition(cond: JevCondition, read: FieldReader, depth = 0): boolean {
  if (depth > 3 * MAX_CONDITION_DEPTH) return false;
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, read, depth + 1));
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, read, depth + 1));
  if ('not' in cond) return !evaluateCondition(cond.not, read, depth + 1);
  return isLeaf(cond) ? evaluateLeaf(cond, read) : false;
}

/** Every field a condition reads (eq_field's `other` included), in first-seen order. */
export function conditionFields(cond: JevCondition | null | undefined): string[] {
  const out: string[] = [];
  const walk = (c: JevCondition, depth: number) => {
    if (depth > 3 * MAX_CONDITION_DEPTH) return;
    if (isLeaf(c)) {
      out.push(c.field);
      if (c.op === 'eq_field') out.push(c.other);
      return;
    }
    children(c).forEach((child) => walk(child, depth + 1));
  };
  if (cond) walk(cond, 0);
  return [...new Set(out)];
}

/**
 * Walks every node with its depth (a top-level node is 1), stopping early
 * when `visit` returns false. Iterative, so a malformed deep tree cannot
 * overflow the stack.
 */
function walkConditions(cond: JevCondition, visit: (c: JevCondition, depth: number) => boolean): void {
  const stack: Array<[JevCondition, number]> = [[cond, 1]];
  while (stack.length > 0) {
    const [c, depth] = stack.pop() as [JevCondition, number];
    if (!visit(c, depth)) return;
    for (const child of children(c)) stack.push([child, depth + 1]);
  }
}

/** Levels of nesting: a leaf is 1, each all / any / not adds 1. Counting stops past 100 levels. */
export function conditionDepth(cond: JevCondition): number {
  let max = 0;
  walkConditions(cond, (_c, depth) => {
    max = Math.max(max, depth);
    return depth <= 100;
  });
  return max;
}

/** Nodes in a condition tree (leaves and all / any / not). Counting stops past 10,000. */
export function conditionNodeCount(cond: JevCondition): number {
  let n = 0;
  walkConditions(cond, () => ++n <= 10_000);
  return n;
}

/**
 * Why stored conditions cannot run (too deep, too many nodes together, an
 * unsafe pattern), or null. Rules are validated when staff save them
 * (validateJevRules); this is the runtime guard for anything that got past.
 */
export function conditionProblem(conds: Array<JevCondition | null | undefined>): string | null {
  let nodes = 0;
  for (const cond of conds) {
    if (!cond) continue;
    if (conditionDepth(cond) > MAX_CONDITION_DEPTH) return `conditions nest deeper than ${MAX_CONDITION_DEPTH} levels`;
    nodes += conditionNodeCount(cond);
    if (nodes > MAX_CONDITION_NODES) return `more than ${MAX_CONDITION_NODES} conditions`;
    const patterns: string[] = [];
    walkConditions(cond, (c) => {
      if (isLeaf(c) && c.op === 'matches') patterns.push(c.pattern);
      return true;
    });
    for (const pattern of patterns) {
      const check = checkPattern(pattern);
      if (!check.ok) return `pattern ${JSON.stringify(pattern)}: ${check.message}`;
    }
  }
  return null;
}
