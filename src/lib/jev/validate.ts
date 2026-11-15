/**
 * validateJevRules: checks staff-drafted per-settlement rules before a spec
 * draft is saved or approved, and explains every problem with the rule's
 * index, id and the dotted path inside it (e.g. "check.all.1.pattern"), so
 * the console editor can point at it. Checks: the JevRuleSetSchema shape, at
 * most 100 rules, unique ids, depth at most 6 and at most 50 conditions per
 * rule, fields that name this form's questions, proof kinds, tiers and payout
 * options, operators that suit the field, real dates, length_between with
 * min <= max, and safe patterns (./pattern.ts).
 */
import { LANES } from '../filing/v2/contract-base';
import { isIsoDate } from './formats';
import { checkPattern } from './pattern';
import { MAX_CONDITION_DEPTH, MAX_CONDITION_NODES } from './conditions';
import {
  JEV_AUDIENCES,
  JEV_FIELD_RE,
  JEV_MODES,
  JEV_SEVERITIES,
  JevRuleSchema,
  type JevRule,
  type JevRuleContext,
  type JevRuleError,
  type JevRulesValidation,
} from './types';

const MAX_RULES = 100;
const RULE_ID_RE = /^[a-z][a-z0-9_.-]{2,79}$/;
const RULE_KEYS = new Set(['id', 'description', 'severity', 'modes', 'when', 'check', 'message', 'field', 'audience']);

const OP_PARAMS: Record<string, readonly string[]> = {
  present: [],
  absent: [],
  is_true: [],
  is_false: [],
  eq: ['value'],
  neq: ['value'],
  in: ['values'],
  not_in: ['values'],
  gt: ['value'],
  gte: ['value'],
  lt: ['value'],
  lte: ['value'],
  date_before: ['value'],
  date_on_or_after: ['value'],
  length_between: ['min', 'max'],
  matches: ['pattern'],
  eq_field: ['other'],
};

type FieldKind = 'member' | 'answer' | 'choice' | 'count' | 'lane';

const KIND_OPS: Record<FieldKind, ReadonlySet<string>> = {
  member: new Set(['present', 'absent', 'eq', 'neq', 'in', 'not_in', 'length_between', 'matches', 'eq_field']),
  answer: new Set(Object.keys(OP_PARAMS)),
  choice: new Set(['present', 'absent', 'eq', 'neq', 'in', 'not_in', 'eq_field']),
  count: new Set(['present', 'absent', 'eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte']),
  lane: new Set(['eq', 'neq', 'in', 'not_in']),
};

const KIND_HINT: Record<FieldKind, string> = {
  member: 'member fields hold text',
  answer: 'answers hold the answer',
  choice: 'it holds an option key: compare with eq, neq, in or not_in',
  count: 'it holds a number: compare with eq, neq, in, not_in, gt, gte, lt or lte',
  lane: 'it holds the lane: compare with eq, neq, in or not_in',
};

function kindOf(field: string): FieldKind {
  if (field.startsWith('member.')) return 'member';
  if (field.startsWith('answers.')) return 'answer';
  if (field === 'benefit_tier' || field === 'payout_method') return 'choice';
  if (field.startsWith('doc_count.') || field === 'meta.days_to_deadline') return 'count';
  return 'lane';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return (
    (typeof value === 'string' && value.length <= 500) ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  );
}

type Add = (path: string, message: string) => void;

class RuleChecker {
  nodes = 0;

  constructor(
    private readonly context: JevRuleContext,
    private readonly add: Add,
  ) {}

  field(raw: unknown, path: string): string | null {
    if (typeof raw !== 'string' || !JEV_FIELD_RE.test(raw)) {
      this.add(path, `${JSON.stringify(raw)} is not a field Jev can read`);
      return null;
    }
    if (raw.startsWith('answers.') && !this.context.questionKeys.includes(raw.slice(8))) {
      this.add(path, `This form has no question with the key ${raw.slice(8)}`);
    } else if (raw.startsWith('doc_count.') && !this.context.documentKinds.includes(raw.slice(10))) {
      this.add(path, `This form has no proof kind ${raw.slice(10)}`);
    } else if (raw === 'benefit_tier' && this.context.benefitTiers.length === 0) {
      this.add(path, 'This form has no benefit tiers');
    } else if (raw === 'payout_method' && this.context.payoutOptions.length === 0) {
      this.add(path, 'This form has no payout options');
    }
    return raw;
  }

  private values(field: string | null, values: unknown[], path: string): void {
    if (!field) return;
    const known =
      field === 'benefit_tier'
        ? this.context.benefitTiers
        : field === 'payout_method'
          ? this.context.payoutOptions
          : field === 'meta.lane'
            ? LANES
            : null;
    values.forEach((value, i) => {
      const at = values.length === 1 ? path : `${path}.${i}`;
      if (known && !(typeof value === 'string' && known.includes(value))) {
        this.add(at, `${JSON.stringify(value)} is not one of: ${known.join(', ')}`);
      } else if (kindOf(field) === 'count' && typeof value !== 'number') {
        this.add(at, `${field} holds a number`);
      }
    });
  }

  condition(raw: unknown, path: string, depth: number): void {
    this.nodes++;
    if (depth > MAX_CONDITION_DEPTH) {
      this.add(path, `Conditions can nest at most ${MAX_CONDITION_DEPTH} levels deep`);
      return;
    }
    if (!isRecord(raw)) {
      this.add(path, 'Each condition must be an object');
      return;
    }
    const keys = Object.keys(raw);
    for (const group of ['all', 'any', 'not'] as const) {
      if (!(group in raw)) continue;
      if (keys.length !== 1) this.add(path, `A condition with "${group}" cannot have other keys`);
      if (group === 'not') {
        this.condition(raw.not, `${path}.not`, depth + 1);
        return;
      }
      const list = raw[group];
      if (!Array.isArray(list) || list.length < 1 || list.length > 20) {
        this.add(`${path}.${group}`, `"${group}" needs a list of 1 to 20 conditions`);
        return;
      }
      list.forEach((child, i) => this.condition(child, `${path}.${group}.${i}`, depth + 1));
      return;
    }
    this.leaf(raw, path);
  }

  private leaf(raw: Record<string, unknown>, path: string): void {
    const field = this.field(raw.field, `${path}.field`);
    const op = raw.op;
    if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(OP_PARAMS, op)) {
      this.add(`${path}.op`, `Unknown operator ${JSON.stringify(op)}`);
      return;
    }
    const params = OP_PARAMS[op];
    for (const key of Object.keys(raw)) {
      if (key !== 'field' && key !== 'op' && !params.includes(key)) this.add(`${path}.${key}`, `"${op}" does not take "${key}"`);
    }
    const missing = params.filter((p) => !(p in raw));
    missing.forEach((p) => this.add(`${path}.${p}`, `"${op}" needs "${p}"`));
    if (missing.length > 0) return;
    if (field && !KIND_OPS[kindOf(field)].has(op)) this.add(`${path}.op`, `${op} does not work on ${field}: ${KIND_HINT[kindOf(field)]}`);

    switch (op) {
      case 'eq':
      case 'neq':
        if (!isScalar(raw.value)) this.add(`${path}.value`, 'Use text (up to 500 characters), a number, or true or false');
        else this.values(field, [raw.value], `${path}.value`);
        return;
      case 'in':
      case 'not_in': {
        const list = raw.values;
        if (!Array.isArray(list) || list.length < 1 || list.length > 100 || !list.every(isScalar)) {
          this.add(`${path}.values`, 'Use a list of 1 to 100 values (text, numbers, or true or false)');
        } else {
          this.values(field, list, `${path}.values`);
        }
        return;
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) this.add(`${path}.value`, `"${op}" compares with a number`);
        return;
      case 'date_before':
      case 'date_on_or_after':
        if (typeof raw.value !== 'string' || !isIsoDate(raw.value)) this.add(`${path}.value`, 'Use a real date as YYYY-MM-DD');
        return;
      case 'length_between': {
        const { min, max } = raw;
        const ok = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5000;
        if (!ok(min)) this.add(`${path}.min`, 'Use a whole number from 0 to 5000');
        if (!ok(max)) this.add(`${path}.max`, 'Use a whole number from 0 to 5000');
        if (ok(min) && ok(max) && (min as number) > (max as number)) this.add(`${path}.min`, 'min must not be larger than max');
        return;
      }
      case 'matches': {
        if (typeof raw.pattern !== 'string') {
          this.add(`${path}.pattern`, 'A pattern is text');
          return;
        }
        const check = checkPattern(raw.pattern);
        if (!check.ok) this.add(`${path}.pattern`, check.message);
        return;
      }
      case 'eq_field': {
        const other = this.field(raw.other, `${path}.other`);
        if (other && other === field) this.add(`${path}.other`, 'Compare two different fields');
        return;
      }
    }
  }
}

function checkRule(raw: unknown, index: number, context: JevRuleContext): { errors: JevRuleError[]; rule: JevRule | null } {
  const errors: JevRuleError[] = [];
  const ruleId = isRecord(raw) && typeof raw.id === 'string' ? raw.id : null;
  const add: Add = (path, message) => errors.push({ index, rule_id: ruleId, path, message });
  if (!isRecord(raw)) {
    add('', 'Each rule must be an object');
    return { errors, rule: null };
  }
  for (const key of Object.keys(raw)) if (!RULE_KEYS.has(key)) add(key, `Rules do not take "${key}"`);
  if (typeof raw.id !== 'string' || !RULE_ID_RE.test(raw.id)) {
    add('id', 'Use 3 to 80 lowercase letters, digits, dots, dashes or underscores, starting with a letter');
  }
  if (typeof raw.description !== 'string' || raw.description.trim() === '' || raw.description.length > 500) {
    add('description', 'Describe the rule in 1 to 500 characters');
  }
  if (!(JEV_SEVERITIES as readonly unknown[]).includes(raw.severity)) add('severity', `Use one of: ${JEV_SEVERITIES.join(', ')}`);
  if (raw.modes !== undefined) {
    const modes = raw.modes;
    const valid =
      Array.isArray(modes) &&
      modes.length >= 1 &&
      modes.length <= 3 &&
      modes.every((m) => (JEV_MODES as readonly unknown[]).includes(m)) &&
      new Set(modes).size === modes.length;
    if (!valid) add('modes', `List 1 to 3 different modes from: ${JEV_MODES.join(', ')}`);
  }
  if (typeof raw.message !== 'string' || raw.message.trim() === '' || raw.message.length > 300) {
    add('message', 'Write the message in 1 to 300 characters of plain English');
  }
  if (raw.audience !== undefined && !(JEV_AUDIENCES as readonly unknown[]).includes(raw.audience)) {
    add('audience', `Use one of: ${JEV_AUDIENCES.join(', ')}`);
  }
  const checker = new RuleChecker(context, add);
  if (raw.field !== undefined) checker.field(raw.field, 'field');
  if (raw.check === undefined) add('check', 'A rule needs a check');
  else checker.condition(raw.check, 'check', 1);
  if (raw.when !== undefined) checker.condition(raw.when, 'when', 1);
  if (checker.nodes > MAX_CONDITION_NODES) add('', `A rule can have at most ${MAX_CONDITION_NODES} conditions`);
  if (errors.length > 0) return { errors, rule: null };

  const parsed = JevRuleSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add(issue.path.join('.'), issue.message);
    return { errors, rule: null };
  }
  return { errors, rule: parsed.data };
}

/**
 * Problems with one condition outside a rule (a question's visible_when),
 * checked exactly as rule conditions are, with paths under `path`.
 */
export function conditionErrors(raw: unknown, path: string, context: JevRuleContext): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const checker = new RuleChecker(context, (at, message) => errors.push({ path: at, message }));
  checker.condition(raw, path, 1);
  if (checker.nodes > MAX_CONDITION_NODES) errors.push({ path, message: `A condition can have at most ${MAX_CONDITION_NODES} parts` });
  return errors;
}

export function validateRules(rules: unknown, context: JevRuleContext): JevRulesValidation {
  if (!Array.isArray(rules)) return { ok: false, errors: [{ index: -1, rule_id: null, path: '', message: 'Rules must be a list' }] };
  const errors: JevRuleError[] = [];
  if (rules.length > MAX_RULES) {
    errors.push({ index: -1, rule_id: null, path: '', message: `A settlement can have at most ${MAX_RULES} rules` });
  }
  const parsed: JevRule[] = [];
  const firstIndexOf = new Map<string, number>();
  rules.forEach((raw, index) => {
    const result = checkRule(raw, index, context);
    errors.push(...result.errors);
    if (result.rule) parsed.push(result.rule);
    const id = isRecord(raw) && typeof raw.id === 'string' ? raw.id : null;
    if (id === null) return;
    const first = firstIndexOf.get(id);
    if (first === undefined) firstIndexOf.set(id, index);
    else errors.push({ index, rule_id: id, path: 'id', message: `Rule ${first + 1} already uses the id ${id}` });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rules: parsed };
}
