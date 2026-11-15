import { describe, expect, it } from 'vitest';
import {
  JEV_ENGINE_VERSION,
  memberCanFix,
  packetPathOfField,
  runJev,
  toMemberResult,
} from '@/lib/jev';
import { JEV_GLOBAL_RULE_IDS, JevIssueSchema, type JevInput } from '@/lib/jev/types';
import { codes, find, jevInput, preSend, rule, specContent, withRules } from './jev-fixtures';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('runJev: a complete packet', () => {
  it.each(['partial', 'pre_sign', 'pre_send'] as const)('passes in %s mode', (mode) => {
    const input = mode === 'pre_send' ? preSend() : jevInput({ mode });
    const result = runJev(input);
    expect(result.issues).toEqual([]);
    expect(result.outcome).toBe('pass');
    expect(result.counts).toEqual({ block: 0, warn: 0, info: 0 });
  });

  it('echoes the engine version, mode, clock and packet hash, and every issue fits the schema', () => {
    const input = jevInput({ mode: 'pre_sign' }, { member: { email: 'not-an-email' } });
    const result = runJev(input);
    expect(result.engine_version).toBe(JEV_ENGINE_VERSION);
    expect(result.mode).toBe('pre_sign');
    expect(result.evaluated_at).toBe(input.now);
    expect(result.packet_hash).toBe(input.packetHash);
    expect(result.rule_set_hash).toMatch(/^[0-9a-f]{64}$/);
    for (const issue of result.issues) expect(JevIssueSchema.parse(issue)).toEqual(issue);
    expect(result.outcome).toBe('block');
  });

  it('is deterministic and never changes its input', () => {
    const input = deepFreeze(jevInput({}, { member: { phone: '12' }, answers: { purchase_date: '2023-02-30', item_count: 99, extra: 'x' } }));
    const first = runJev(input);
    const second = runJev(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('only covers the global rule ids and per-settlement rules it knows', () => {
    const input = jevInput({}, { member: { legal_name: null, email: null }, answers: {} });
    for (const issue of runJev(input).issues) {
      if (issue.source === 'global') expect([...JEV_GLOBAL_RULE_IDS, 'jev.engine'] as string[]).toContain(issue.rule_id);
    }
  });
});

describe('every issue fits the contract', () => {
  it('across many broken packets, in every mode and lane', () => {
    const broken: Array<Parameters<typeof jevInput>> = [
      [{}, { member: { legal_name: null, email: 'x', phone: '1' }, address: { state: 'ZZ', zip: '1', line1: null } }],
      [{}, { answers: { purchase_date: 'soon', item_count: -1, store: 'moon', notes: 'PIN 4821 and 4111 1111 1111 1111', other: 1 } }],
      [{ settlement: { openForClaims: false, deadline: '2026-11-13', daysToDeadline: 1 } }, { packet: { benefit_tier: 'gold', payout_method: 'cash', confirmations: { class_definition: false, health_data_consent: null } } }],
      [{ policy: { ...jevInput().policy, kill_switch: true, identity_check_required: true, agent_filing: 'unknown' } }, {}],
      [{ healthConsent: { required: true, textAvailable: false, given: false }, duplicates: { sameIdentityOtherAccounts: 1 } }, {}],
      [{ spec: null }, { packet: { spec: null } }],
    ];
    let seen = 0;
    for (const [overrides, options] of broken) {
      for (const mode of ['partial', 'pre_sign', 'pre_send'] as const) {
        for (const lane of ['filing_desk', 'administrator_email', 'administrator_bulk', 'administrator_api', 'self_file'] as const) {
          const result = runJev(mode === 'pre_send' ? preSend({ ...overrides, lane }, options) : jevInput({ ...overrides, mode, lane }, options));
          for (const issue of result.issues) expect(JevIssueSchema.parse(issue)).toEqual(issue);
          expect(result.counts.block + result.counts.warn + result.counts.info).toBe(result.issues.length);
          seen += result.issues.length;
        }
      }
    }
    expect(seen).toBeGreaterThan(300);
  });
});

describe('modes', () => {
  const incomplete = { member: { email: null }, answers: { item_count: 3 } };

  it('reports missing answers as info while filling and as block before signing', () => {
    const partial = runJev(jevInput({ mode: 'partial' }, incomplete));
    const signing = runJev(jevInput({ mode: 'pre_sign' }, incomplete));
    const missing = (r: typeof partial) => r.issues.filter((i) => i.code === 'required_missing').map((i) => [i.field, i.severity]);
    expect(missing(partial)).toEqual([
      ['member.email', 'info'],
      ['answers.purchase_date', 'info'],
    ]);
    expect(missing(signing)).toEqual([
      ['member.email', 'block'],
      ['answers.purchase_date', 'block'],
    ]);
    expect(partial.outcome).toBe('pass');
    expect(signing.outcome).toBe('block');
  });

  it('still blocks invalid and never-collected values while filling', () => {
    const result = runJev(jevInput({ mode: 'partial' }, { answers: { purchase_date: '2023-05-01', item_count: 3, ssn_box: '123-45-6789' } }));
    expect(find(result, 'unknown_question')?.severity).toBe('block');
    expect(find(result, 'secret_like_value')?.severity).toBe('block');
  });

  it('runs signing rules only before signing and sending, and binding rules only before sending', () => {
    const notConfirmed = { packet: { confirmations: { class_definition: false, health_data_consent: null } } };
    expect(codes(runJev(jevInput({ mode: 'partial' }, notConfirmed)))).not.toContain('class_definition_not_confirmed');
    expect(codes(runJev(jevInput({ mode: 'pre_sign' }, notConfirmed)))).toContain('class_definition_not_confirmed');
    expect(codes(runJev(jevInput({ mode: 'pre_sign', signature: null })))).not.toContain('signature_missing');
    expect(codes(runJev(preSend({ signature: null })))).toContain('signature_missing');
  });

  it('treats a closed settlement as a warning while filling and a block before signing', () => {
    const closed = { settlement: { openForClaims: false, deadline: '2026-12-31', daysToDeadline: 49 } };
    expect(find(runJev(jevInput({ mode: 'partial', ...closed })), 'settlement_closed')?.severity).toBe('warn');
    expect(find(runJev(jevInput({ mode: 'pre_sign', ...closed })), 'settlement_closed')?.severity).toBe('block');
  });
});

describe('order, counts and outcome', () => {
  it('orders block, warn, info, then by the official field order, general issues first', () => {
    const input = jevInput(
      { mode: 'partial', settlement: { openForClaims: false, deadline: null, daysToDeadline: null } },
      { member: { legal_name: 'Ada', email: null }, address: { zip: '1234' }, answers: { item_count: 0 } },
    );
    const result = runJev(input);
    const seen = result.issues.map((i) => `${i.severity}:${i.field ?? '-'}:${i.code}`);
    expect(seen).toEqual([
      'block:member.address.zip:invalid_zip',
      'block:answers.item_count:out_of_range',
      'warn:-:settlement_closed',
      'warn:member.legal_name:legal_name_incomplete',
      'info:member.email:required_missing',
      'info:answers.purchase_date:required_missing',
    ]);
    expect(result.counts).toEqual({ block: 2, warn: 2, info: 2 });
    expect(result.outcome).toBe('block');
  });

  it('is warn when nothing blocks but something warns', () => {
    const result = runJev(jevInput({}, { member: { legal_name: 'Ada' } }));
    expect(result.outcome).toBe('warn');
    expect(result.counts.warn).toBe(1);
  });
});

describe('rule_set_hash', () => {
  it('is stable for the same rules and changes when a settlement rule changes', () => {
    const r1 = rule({ id: 'acme.count', check: { field: 'answers.item_count', op: 'lte', value: 10 } });
    const a = runJev(jevInput({}, { content: withRules([r1]) })).rule_set_hash;
    const b = runJev(jevInput({ mode: 'partial' }, { content: withRules([r1]) })).rule_set_hash;
    const c = runJev(jevInput({}, { content: withRules([{ ...r1, check: { field: 'answers.item_count', op: 'lte', value: 11 } }]) })).rule_set_hash;
    const none = runJev(jevInput()).rule_set_hash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(none);
    expect(runJev(jevInput({ spec: null })).rule_set_hash).toBe(none);
  });
});

describe('audiences', () => {
  it('never tells the member about a kill switch or an objection', () => {
    const input = jevInput({ policy: { ...jevInput().policy, kill_switch: true, kill_switch_scope: 'settlement', objection_received_at: '2026-11-10T12:00:00Z' } });
    const result = runJev(input);
    const member = toMemberResult(result);
    expect(codes(result, 'staff')).toEqual(expect.arrayContaining(['kill_switch', 'objection_received']));
    expect(member.issues.every((i) => i.audience === 'member')).toBe(true);
    expect(codes(member)).toEqual(['not_offered_for_settlement']);
    expect(JSON.stringify(member)).not.toMatch(/kill|objection/i);
    expect(member.outcome).toBe('block');
    expect(member.counts).toEqual({ block: 1, warn: 0, info: 0 });
  });

  it('adds a member-safe line when only a staff issue blocks', () => {
    const staffOnly = rule({ id: 'acme.ops_hold', audience: 'staff', check: { field: 'meta.days_to_deadline', op: 'gte', value: 60 }, message: 'Hold for ops review.' });
    const result = runJev(jevInput({}, { content: withRules([staffOnly]) }));
    expect(find(result, 'settlement_rule', 'staff')?.message).toBe('Hold for ops review.');
    const member = toMemberResult(result);
    expect(codes(member)).toEqual(['staff_check_required']);
    expect(member.outcome).toBe('block');
  });

  it('drops staff-only warnings from the member copy', () => {
    const result = runJev(preSend({ duplicates: { sameIdentityOtherAccounts: 2 } }));
    expect(result.outcome).toBe('warn');
    expect(toMemberResult(result)).toMatchObject({ outcome: 'pass', issues: [] });
  });
});

describe('never throws', () => {
  it('blocks with a staff issue when the input cannot be read', () => {
    const broken = { ...jevInput(), packet: undefined } as unknown as JevInput;
    const result = runJev(broken);
    expect(result.outcome).toBe('block');
    expect(find(result, 'engine_unavailable', 'staff')?.message).toMatch(/invalid input/);
    expect(codes(toMemberResult(result))).toEqual(['staff_check_required']);
  });

  it('turns a rule that crashes into a staff block instead of an exception', () => {
    const input = jevInput();
    const spec = input.spec as NonNullable<JevInput['spec']>;
    const content = { ...spec.content, payout_options: [null] } as unknown as typeof spec.content;
    const result = runJev({ ...input, spec: { ...spec, content } });
    expect(find(result, 'engine_unavailable', 'staff')).toMatchObject({ rule_id: 'global.payout_method', severity: 'block' });
    expect(result.outcome).toBe('block');
  });

  it('flags an unknown mode and an unreadable clock', () => {
    const result = runJev({ ...jevInput(), mode: 'later' as never, now: 'yesterday' });
    expect(result.issues.filter((i) => i.code === 'engine_unavailable')).toHaveLength(2);
    expect(result.mode).toBe('pre_send');
  });
});

describe('helpers for callers', () => {
  it('memberCanFix: member-fixable blocks only', () => {
    expect(memberCanFix(runJev(preSend({}, { member: { email: null } })))).toBe(true);
    expect(memberCanFix(runJev(preSend({ settlement: { openForClaims: true, deadline: '2026-11-14', daysToDeadline: 2 } })))).toBe(false);
    expect(memberCanFix(runJev(preSend()))).toBe(false);
  });

  it('packetPathOfField maps Jev paths to packet item paths', () => {
    expect(packetPathOfField('doc_count.purchase_proof')).toBe('documents.purchase_proof');
    expect(packetPathOfField('answers.item_count')).toBe('answers.item_count');
    expect(packetPathOfField('meta.lane')).toBeNull();
    expect(packetPathOfField(null)).toBeNull();
  });

  it('works without a spec (self-file copy panel): member fields only', () => {
    const result = runJev(jevInput({ mode: 'partial', lane: 'self_file', spec: null }, { packet: { spec: null, benefit_tier: null, payout_method: null }, answers: {} }));
    expect(result.outcome).toBe('pass');
    expect(specContent().questions.length).toBeGreaterThan(0);
  });
});
