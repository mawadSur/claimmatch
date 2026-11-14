import { describe, expect, it } from 'vitest';
import { jevSpecProblems, ruleContextOf, validateJevRules } from '@/lib/jev';
import { SPEC_INPUT, specContent, withRules } from './jev-fixtures';
import type { JevCondition, JevRuleContext, JevRulesValidation } from '@/lib/jev/types';

const CONTEXT: JevRuleContext = {
  questionKeys: ['item_count', 'purchase_date', 'store', 'notes'],
  documentKinds: ['purchase_proof'],
  benefitTiers: ['no_proof', 'with_proof'],
  payoutOptions: ['check', 'paypal'],
};

const base = {
  id: 'acme.max_items',
  description: 'Up to 5 items without proof',
  severity: 'block',
  check: { any: [{ field: 'answers.item_count', op: 'lte', value: 5 }, { field: 'doc_count.purchase_proof', op: 'gte', value: 1 }] },
  message: 'Without proof you can claim up to 5 items.',
};

function errorsOf(result: JevRulesValidation) {
  return result.ok ? [] : result.errors;
}

/** The [path, message] pairs for one rule built from `base` plus `change`. */
function problems(change: Record<string, unknown>) {
  return errorsOf(validateJevRules([{ ...base, ...change }], CONTEXT)).map((e) => [e.path, e.message]);
}

const leaf = (cond: Record<string, unknown>) => problems({ check: cond });

describe('validateJevRules: valid rules', () => {
  it('accepts a good rule set and fills defaults', () => {
    const result = validateJevRules(
      [
        base,
        {
          id: 'acme.online_proof',
          description: 'Online orders need proof',
          severity: 'warn',
          modes: ['pre_sign', 'pre_send'],
          when: { field: 'answers.store', op: 'eq', value: 'online' },
          check: { field: 'doc_count.purchase_proof', op: 'gte', value: 1 },
          message: 'Upload your order confirmation.',
          field: 'doc_count.purchase_proof',
          audience: 'member',
        },
        {
          id: 'acme.desk_only',
          description: 'Ops lead time',
          severity: 'info',
          check: {
            all: [
              { field: 'meta.lane', op: 'in', values: ['filing_desk', 'administrator_bulk'] },
              { field: 'meta.days_to_deadline', op: 'gte', value: 10 },
              { field: 'benefit_tier', op: 'neq', value: 'with_proof' },
              { field: 'payout_method', op: 'in', values: ['check'] },
              { field: 'member.address.zip', op: 'matches', pattern: '^\\d{5}(-\\d{4})?$' },
              { field: 'answers.purchase_date', op: 'date_on_or_after', value: '2020-01-01' },
              { field: 'answers.notes', op: 'length_between', min: 0, max: 500 },
              { field: 'answers.notes', op: 'eq_field', other: 'member.email' },
            ],
          },
          message: 'Check the lead time.',
          audience: 'staff',
        },
      ],
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules).toHaveLength(3);
      expect(result.rules[0].audience).toBe('member');
    }
    expect(validateJevRules([], CONTEXT)).toEqual({ ok: true, rules: [] });
  });
});

describe('validateJevRules: the set', () => {
  it('needs a list of at most 100 rules with unique ids', () => {
    expect(errorsOf(validateJevRules({ rules: [] }, CONTEXT))).toEqual([{ index: -1, rule_id: null, path: '', message: 'Rules must be a list' }]);
    const many = Array.from({ length: 101 }, (_, i) => ({ ...base, id: `acme.rule_${i}` }));
    expect(errorsOf(validateJevRules(many, CONTEXT))).toEqual([{ index: -1, rule_id: null, path: '', message: 'A settlement can have at most 100 rules' }]);
    const twice = errorsOf(validateJevRules([base, { ...base }], CONTEXT));
    expect(twice).toEqual([{ index: 1, rule_id: 'acme.max_items', path: 'id', message: 'Rule 1 already uses the id acme.max_items' }]);
  });

  it('reports every bad rule, not just the first', () => {
    const errors = errorsOf(validateJevRules([{ ...base, id: 'X' }, base, { ...base, id: 'acme.third', severity: 'fatal' }], CONTEXT));
    expect(errors.map((e) => [e.index, e.rule_id, e.path])).toEqual([
      [0, 'X', 'id'],
      [2, 'acme.third', 'severity'],
    ]);
  });
});

describe('validateJevRules: rule fields', () => {
  it.each([
    [{ extra: 1 }, 'extra', 'Rules do not take "extra"'],
    [{ id: 'Acme rule' }, 'id', 'Use 3 to 80 lowercase letters, digits, dots, dashes or underscores, starting with a letter'],
    [{ description: '' }, 'description', 'Describe the rule in 1 to 500 characters'],
    [{ severity: 'error' }, 'severity', 'Use one of: block, warn, info'],
    [{ modes: ['partial', 'partial'] }, 'modes', 'List 1 to 3 different modes from: partial, pre_sign, pre_send'],
    [{ modes: [] }, 'modes', 'List 1 to 3 different modes from: partial, pre_sign, pre_send'],
    [{ message: '   ' }, 'message', 'Write the message in 1 to 300 characters of plain English'],
    [{ message: 'x'.repeat(301) }, 'message', 'Write the message in 1 to 300 characters of plain English'],
    [{ audience: 'lawyers' }, 'audience', 'Use one of: member, staff'],
    [{ field: 'answers.pin' }, 'field', 'This form has no question with the key pin'],
    [{ check: undefined }, 'check', 'A rule needs a check'],
  ])('%j', (change, path, message) => {
    expect(problems(change)).toEqual([[path, message]]);
  });

  it('keeps the rule id on errors when it can', () => {
    const [error] = errorsOf(validateJevRules([{ ...base, severity: 'loud' }], CONTEXT));
    expect(error).toEqual({ index: 0, rule_id: 'acme.max_items', path: 'severity', message: 'Use one of: block, warn, info' });
    expect(errorsOf(validateJevRules(['not a rule'], CONTEXT))).toEqual([{ index: 0, rule_id: null, path: '', message: 'Each rule must be an object' }]);
  });
});

describe('validateJevRules: conditions', () => {
  it.each([
    [{ field: 'profile.ssn', op: 'present' }, 'check.field', '"profile.ssn" is not a field Jev can read'],
    [{ field: 'answers.pin', op: 'present' }, 'check.field', 'This form has no question with the key pin'],
    [{ field: 'doc_count.bank_statement', op: 'gte', value: 1 }, 'check.field', 'This form has no proof kind bank_statement'],
    [{ field: 'answers.store', op: 'like', value: 'x' }, 'check.op', 'Unknown operator "like"'],
    [{ field: 'answers.store', op: 'present', value: 1 }, 'check.value', '"present" does not take "value"'],
    [{ field: 'answers.store', op: 'eq' }, 'check.value', '"eq" needs "value"'],
    [{ field: 'answers.store', op: 'eq', value: { a: 1 } }, 'check.value', 'Use text (up to 500 characters), a number, or true or false'],
    [{ field: 'answers.store', op: 'in', values: [] }, 'check.values', 'Use a list of 1 to 100 values (text, numbers, or true or false)'],
    [{ field: 'answers.item_count', op: 'gt', value: '5' }, 'check.value', '"gt" compares with a number'],
    [{ field: 'answers.purchase_date', op: 'date_before', value: '2024-02-30' }, 'check.value', 'Use a real date as YYYY-MM-DD'],
    [{ field: 'answers.notes', op: 'length_between', min: 10, max: 5 }, 'check.min', 'min must not be larger than max'],
    [{ field: 'answers.notes', op: 'length_between', min: -1, max: 5 }, 'check.min', 'Use a whole number from 0 to 5000'],
    [{ field: 'answers.notes', op: 'eq_field', other: 'answers.notes' }, 'check.other', 'Compare two different fields'],
    [{ field: 'answers.notes', op: 'eq_field', other: 'answers.pin' }, 'check.other', 'This form has no question with the key pin'],
    [{ field: 'benefit_tier', op: 'eq', value: 'gold' }, 'check.value', '"gold" is not one of: no_proof, with_proof'],
    [{ field: 'payout_method', op: 'in', values: ['check', 'venmo'] }, 'check.values.1', '"venmo" is not one of: check, paypal'],
    [{ field: 'meta.lane', op: 'eq', value: 'fax' }, 'check.value', '"fax" is not one of: filing_desk, administrator_email, administrator_bulk, administrator_api, self_file'],
    [{ field: 'doc_count.purchase_proof', op: 'eq', value: 'one' }, 'check.value', 'doc_count.purchase_proof holds a number'],
    [{ field: 'doc_count.purchase_proof', op: 'matches', pattern: '1' }, 'check.op', 'matches does not work on doc_count.purchase_proof: it holds a number: compare with eq, neq, in, not_in, gt, gte, lt or lte'],
    [{ field: 'member.legal_name', op: 'gt', value: 1 }, 'check.op', 'gt does not work on member.legal_name: member fields hold text'],
    [{ field: 'meta.lane', op: 'present' }, 'check.op', 'present does not work on meta.lane: it holds the lane: compare with eq, neq, in or not_in'],
    [{ all: [] }, 'check.all', '"all" needs a list of 1 to 20 conditions'],
    [{ all: [{ field: 'answers.store', op: 'present' }], any: [] }, 'check', 'A condition with "all" cannot have other keys'],
    [{ not: 'x' }, 'check.not', 'Each condition must be an object'],
  ])('%j', (cond, path, message) => {
    expect(leaf(cond)).toEqual([[path, message]]);
  });

  it('points inside nested conditions and the when clause', () => {
    const errors = problems({
      when: { any: [{ field: 'answers.store', op: 'present' }, { field: 'answers.pin', op: 'present' }] },
      check: { all: [{ not: { field: 'answers.notes', op: 'matches', pattern: '(a+)+' } }] },
    });
    expect(errors).toEqual([
      ['check.all.0.not.pattern', 'Nested quantifiers are not allowed: a repeated group cannot hold a quantifier or |'],
      ['when.any.1.field', 'This form has no question with the key pin'],
    ]);
  });

  it('limits depth to 6 and size to 50 conditions', () => {
    let deep: JevCondition = { field: 'answers.store', op: 'present' };
    for (let i = 0; i < 6; i++) deep = { not: deep };
    expect(leaf(deep as unknown as Record<string, unknown>)).toEqual([['check.not.not.not.not.not.not', 'Conditions can nest at most 6 levels deep']]);
    let ok: JevCondition = { field: 'answers.store', op: 'present' };
    for (let i = 0; i < 5; i++) ok = { not: ok };
    expect(leaf(ok as unknown as Record<string, unknown>)).toEqual([]);
    const wide = (n: number) => ({ any: Array.from({ length: n }, () => ({ field: 'answers.store', op: 'present' })) });
    expect(problems({ check: { all: [wide(20), wide(20)] }, when: wide(10) })).toEqual([['', 'A rule can have at most 50 conditions']]);
    // 1 + 2 + 40 in check, 1 + 6 in when: exactly 50.
    expect(problems({ check: { all: [wide(20), wide(20)] }, when: wide(6) })).toEqual([]);
  });

  it.each([
    ['(a+)+', 'Nested quantifiers are not allowed: a repeated group cannot hold a quantifier or |'],
    ['(?:a|b)*', 'Nested quantifiers are not allowed: a repeated group cannot hold a quantifier or |'],
    ['(\\w)\\1', 'Back-references are not allowed'],
    ['(?<year>\\d{4})', 'Named groups are not supported: use (...) or (?:...)'],
    ['(?=\\d)', 'Lookahead and lookbehind are not allowed'],
    ['(?<!x)y', 'Lookahead and lookbehind are not allowed'],
    ['\\cA', '\\c escapes are not supported'],
    ['a{501}', 'Repeat counts above 500 are not supported'],
    ['[a-z]{0,400}[a-z]{0,400}[a-z]{0,400}', 'This pattern is too complex: make it shorter or use smaller repeat counts'],
    ['[a-', 'This is not a valid pattern'],
    ['x'.repeat(201), 'A pattern can be at most 200 characters'],
  ])('refuses the pattern %j', (pattern, message) => {
    expect(leaf({ field: 'answers.notes', op: 'matches', pattern })).toEqual([['check.pattern', message]]);
  });
});

describe('jevSpecProblems: the whole spec', () => {
  it('builds the rule context from the spec and passes a clean spec', () => {
    expect(ruleContextOf(specContent())).toEqual({
      questionKeys: ['purchase_date', 'item_count', 'store', 'notes', 'proof_amount'],
      documentKinds: ['purchase_proof'],
      benefitTiers: ['no_proof', 'with_proof'],
      payoutOptions: ['check', 'paypal'],
    });
    expect(jevSpecProblems(specContent())).toEqual([]);
  });

  it('checks question patterns, bounds and visible_when, and the spec’s rules, with paths inside the spec', () => {
    const questions = [
      ...(SPEC_INPUT.questions ?? []),
      { key: 'code', official_label: 'Code', type: 'text', required: false, validation: { pattern: '(\\d+)+', min_length: 5, max_length: 2 } },
      { key: 'qty', official_label: 'Quantity', type: 'integer', required: false, validation: { min: 9, max: 1 } },
      { key: 'why', official_label: 'Why?', type: 'text', required: false, visible_when: { field: 'answers.why', op: 'present' } },
      { key: 'where', official_label: 'Where?', type: 'text', required: false, visible_when: { field: 'answers.pin', op: 'present' } },
    ] as typeof SPEC_INPUT.questions;
    const content = withRules([{ ...base, check: { field: 'doc_count.bank_statement', op: 'gte', value: 1 } }], { questions });
    expect(jevSpecProblems(content)).toEqual([
      { path: 'questions.5.validation.pattern', message: 'Nested quantifiers are not allowed: a repeated group cannot hold a quantifier or |' },
      { path: 'questions.5.validation.min_length', message: 'min_length must not be larger than max_length' },
      { path: 'questions.6.validation.min', message: 'min must not be larger than max' },
      { path: 'questions.7.visible_when', message: 'A question cannot depend on its own answer' },
      { path: 'questions.8.visible_when.field', message: 'This form has no question with the key pin' },
      { path: 'jev_rules.0.check.field', message: 'This form has no proof kind bank_statement' },
    ]);
  });
});
