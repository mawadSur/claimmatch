import { describe, expect, it } from 'vitest';
import { runJev } from '@/lib/jev';
import { conditionDepth, conditionFields, conditionNodeCount, evaluateCondition, type JevValue } from '@/lib/jev/conditions';
import type { JevCondition } from '@/lib/jev/types';
import type { PacketDraft } from '@/lib/filing/v2/contract';
import { DOC_ID, codes, jevInput, preSend, rule, sha, withRules } from './jev-fixtures';

const VALUES: Record<string, JevValue> = {
  'answers.count': 7,
  'answers.amount': '12.50',
  'answers.name': 'Widget Pro',
  'answers.yes': true,
  'answers.no': false,
  'answers.empty': '',
  'answers.sizes': ['m', 's'],
  'answers.date': '2023-05-01',
  'answers.date_copy': '2023-05-01',
  'answers.other_date': '2024-01-01',
  'doc_count.proof': 2,
  'doc_count.none': 0,
  'meta.lane': 'filing_desk',
  'meta.days_to_deadline': 10,
  benefit_tier: 'with_proof',
};
const read = (field: string) => VALUES[field];
const holds = (cond: JevCondition) => evaluateCondition(cond, read);

describe('condition operators', () => {
  it.each<[JevCondition, boolean]>([
    [{ field: 'answers.count', op: 'present' }, true],
    [{ field: 'answers.empty', op: 'present' }, false],
    [{ field: 'answers.missing', op: 'absent' }, true],
    [{ field: 'doc_count.none', op: 'absent' }, true],
    [{ field: 'doc_count.proof', op: 'present' }, true],
    [{ field: 'answers.yes', op: 'is_true' }, true],
    [{ field: 'answers.no', op: 'is_true' }, false],
    [{ field: 'answers.no', op: 'is_false' }, true],
    [{ field: 'answers.missing', op: 'is_false' }, false],
    [{ field: 'answers.name', op: 'eq', value: 'Widget Pro' }, true],
    [{ field: 'answers.name', op: 'eq', value: 'widget pro' }, false],
    [{ field: 'answers.count', op: 'eq', value: '7' }, false],
    [{ field: 'answers.sizes', op: 'eq', value: 's' }, true],
    [{ field: 'answers.sizes', op: 'neq', value: 'l' }, true],
    [{ field: 'answers.missing', op: 'neq', value: 'x' }, true],
    [{ field: 'answers.missing', op: 'eq', value: '' }, false],
    [{ field: 'benefit_tier', op: 'in', values: ['with_proof', 'other'] }, true],
    [{ field: 'answers.sizes', op: 'in', values: ['l', 'm'] }, true],
    [{ field: 'answers.sizes', op: 'not_in', values: ['l'] }, true],
    [{ field: 'answers.missing', op: 'not_in', values: ['l'] }, true],
    [{ field: 'answers.count', op: 'gt', value: 6 }, true],
    [{ field: 'answers.count', op: 'lte', value: 6 }, false],
    [{ field: 'answers.amount', op: 'gte', value: 12.5 }, true],
    [{ field: 'answers.amount', op: 'lt', value: 12 }, false],
    [{ field: 'answers.name', op: 'gt', value: 0 }, false],
    [{ field: 'answers.missing', op: 'lt', value: 100 }, false],
    [{ field: 'doc_count.none', op: 'lt', value: 1 }, true],
    [{ field: 'meta.days_to_deadline', op: 'gte', value: 10 }, true],
    [{ field: 'answers.date', op: 'date_on_or_after', value: '2023-05-01' }, true],
    [{ field: 'answers.date', op: 'date_before', value: '2023-05-01' }, false],
    [{ field: 'answers.name', op: 'date_before', value: '2030-01-01' }, false],
    [{ field: 'answers.name', op: 'length_between', min: 1, max: 10 }, true],
    [{ field: 'answers.name', op: 'length_between', min: 1, max: 9 }, false],
    [{ field: 'answers.sizes', op: 'length_between', min: 0, max: 2 }, true],
    [{ field: 'answers.count', op: 'length_between', min: 0, max: 9 }, false],
    [{ field: 'answers.name', op: 'matches', pattern: '^Widget\\s' }, true],
    [{ field: 'answers.count', op: 'matches', pattern: '^\\d$' }, true],
    [{ field: 'answers.name', op: 'matches', pattern: '(a+)+' }, false],
    [{ field: 'answers.date', op: 'eq_field', other: 'answers.date_copy' }, true],
    [{ field: 'answers.date', op: 'eq_field', other: 'answers.other_date' }, false],
    [{ field: 'answers.missing', op: 'eq_field', other: 'answers.missing_too' }, false],
    [{ field: 'meta.lane', op: 'eq', value: 'filing_desk' }, true],
    [{ all: [{ field: 'answers.yes', op: 'is_true' }, { field: 'answers.count', op: 'gt', value: 5 }] }, true],
    [{ any: [{ field: 'answers.no', op: 'is_true' }, { field: 'answers.count', op: 'gt', value: 50 }] }, false],
    [{ not: { field: 'answers.no', op: 'is_true' } }, true],
  ])('%j is %s', (cond, expected) => {
    expect(holds(cond)).toBe(expected);
  });

  it('reports the fields, depth and size of a condition', () => {
    const cond: JevCondition = { all: [{ field: 'answers.a', op: 'present' }, { not: { field: 'answers.b', op: 'eq_field', other: 'answers.c' } }] };
    expect(conditionFields(cond)).toEqual(['answers.a', 'answers.b', 'answers.c']);
    expect(conditionDepth(cond)).toBe(3);
    expect(conditionNodeCount(cond)).toBe(4);
  });
});

const doc = (kind: string): PacketDraft['documents'][number] => ({ id: DOC_ID(1), kind, sha256: sha(kind), mime: 'application/pdf', size_bytes: 10 });

describe('settlement rules in runJev', () => {
  const kroger = rule({
    id: 'acme.max_items',
    description: 'Up to 5 items without proof',
    check: { any: [{ field: 'answers.item_count', op: 'lte', value: 5 }, { field: 'doc_count.purchase_proof', op: 'gte', value: 1 }] },
    message: 'Without proof you can claim up to 5 items.',
    field: 'answers.item_count',
  });

  it('reports the rule’s own message at its severity when its check fails', () => {
    const content = withRules([kroger]);
    expect(runJev(jevInput({}, { content })).issues).toEqual([]);
    const result = runJev(jevInput({}, { content, answers: { purchase_date: '2023-05-01', item_count: 8 } }));
    expect(result.issues).toEqual([
      { rule_id: 'acme.max_items', source: 'settlement', severity: 'block', code: 'settlement_rule', message: 'Without proof you can claim up to 5 items.', field: 'answers.item_count', audience: 'member' },
    ]);
  });

  it('while filling, skips a rule whose fields are all empty and softens one whose fields are partly empty', () => {
    const content = withRules([kroger]);
    const empty = runJev(jevInput({ mode: 'partial' }, { content, answers: { purchase_date: '2023-05-01' } }));
    expect(codes(empty)).toEqual(['required_missing']);
    const partly = runJev(jevInput({ mode: 'partial' }, { content, answers: { purchase_date: '2023-05-01', item_count: 8 } }));
    expect(partly.issues.find((i) => i.code === 'settlement_rule')?.severity).toBe('info');
    expect(partly.outcome).toBe('pass');
  });

  it('keeps the full severity while filling once every field is filled', () => {
    const period = rule({
      id: 'acme.class_period',
      check: { all: [{ field: 'answers.purchase_date', op: 'date_on_or_after', value: '2020-01-01' }, { field: 'answers.purchase_date', op: 'date_before', value: '2024-07-01' }] },
      message: 'The purchase must be between January 1, 2020 and June 30, 2024.',
    });
    const result = runJev(jevInput({ mode: 'partial' }, { content: withRules([period]), answers: { purchase_date: '2019-12-31', item_count: 1 } }));
    expect(result.issues.map((i) => [i.code, i.severity])).toEqual([['settlement_rule', 'block']]);
    expect(runJev(jevInput({ mode: 'partial' }, { content: withRules([period]), answers: { purchase_date: '2024-06-30', item_count: 1 } })).issues).toEqual([]);
  });

  it('applies a check only when its condition holds (if a field, require a document)', () => {
    const conditional = rule({
      id: 'acme.online_needs_proof',
      when: { field: 'answers.store', op: 'eq', value: 'online' },
      check: { field: 'doc_count.purchase_proof', op: 'gte', value: 1 },
      message: 'Upload your order confirmation for an online purchase.',
    });
    const content = withRules([conditional]);
    expect(codes(runJev(jevInput({}, { content })))).toEqual(['settlement_rule']);
    expect(runJev(jevInput({}, { content, answers: { purchase_date: '2023-05-01', item_count: 3, store: 'in_store' } })).issues).toEqual([]);
    const withDoc = runJev(jevInput({}, { content, packet: { benefit_tier: 'with_proof', documents: [doc('purchase_proof')] }, answers: { purchase_date: '2023-05-01', item_count: 3, store: 'online', proof_amount: '5.00' } }));
    expect(withDoc.issues).toEqual([]);
  });

  it('runs only in the modes it lists, and reads the lane and days to the deadline', () => {
    const lastMinute = rule({
      id: 'acme.desk_lead_time',
      modes: ['pre_send'],
      when: { field: 'meta.lane', op: 'eq', value: 'filing_desk' },
      check: { field: 'meta.days_to_deadline', op: 'gte', value: 60 },
      message: 'Hold for the desk lead.',
      audience: 'staff',
      severity: 'warn',
    });
    const content = withRules([lastMinute]);
    expect(runJev(jevInput({}, { content })).issues).toEqual([]);
    const sending = runJev(preSend({}, { content }));
    expect(sending.issues).toEqual([expect.objectContaining({ rule_id: 'acme.desk_lead_time', audience: 'staff', severity: 'warn' })]);
    expect(runJev(preSend({ lane: 'administrator_email' }, { content })).issues).toEqual([]);
  });

  it('compares two fields and counts choices', () => {
    const twice = rule({ id: 'acme.confirm_email', check: { field: 'answers.notes', op: 'eq_field', other: 'member.email' }, message: 'Type the same email twice.' });
    const content = withRules([twice]);
    expect(codes(runJev(jevInput({}, { content, answers: { purchase_date: '2023-05-01', item_count: 3, notes: 'ada@example.com' } })))).toEqual([]);
    expect(codes(runJev(jevInput({}, { content, answers: { purchase_date: '2023-05-01', item_count: 3, notes: 'ada@example.org' } })))).toEqual(['settlement_rule']);
  });

  it('skips a stored rule that cannot run and tells staff, without blocking the member', () => {
    let deep: JevCondition = { field: 'answers.item_count', op: 'present' };
    for (let i = 0; i < 7; i++) deep = { not: { not: deep } };
    const broken = [
      rule({ id: 'acme.unsafe', check: { field: 'answers.notes', op: 'matches', pattern: '(a*)*b' } }),
      rule({ id: 'acme.deep', check: deep }),
    ];
    const result = runJev(jevInput({}, { content: withRules(broken) }));
    expect(result.issues.map((i) => [i.rule_id, i.code, i.audience, i.severity])).toEqual([
      ['acme.deep', 'rule_invalid', 'staff', 'warn'],
      ['acme.unsafe', 'rule_invalid', 'staff', 'warn'],
    ]);
    expect(result.outcome).toBe('warn');
  });
});
