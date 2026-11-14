import { describe, expect, it } from 'vitest';
import { chooseLane, getChannelAdapter, resolveEffectivePolicy, toLaneView, type LaneInput } from '@/lib/filing/channels/index';
import { addBusinessDaysCapped, effectiveDeadline, endOfDay, lastDayForAgent, specTimeZone } from '@/lib/filing/channels/dates';
import { healthConsentRequiredFor, needsDocumentsFor } from '@/lib/filing/channels/lane';
import { intersectStates, policyRecordFromRow } from '@/lib/filing/channels/policy';
import {
  DEFAULT_EFFECTIVE_POLICY,
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  type FilingPolicyContentInput,
  type FilingPolicyRecord,
} from '@/lib/filing/v2/contract-spec';

const LAWSUIT = '00000000-0000-4000-8000-0000000000a1';
const POLICY = '00000000-0000-4000-8000-0000000000b1';
const ADMIN_POLICY = '00000000-0000-4000-8000-0000000000b2';
const SPEC_ID = '00000000-0000-4000-8000-0000000000c1';
/** Thursday, 10:00 in New York. */
const NOW = new Date('2026-11-12T15:00:00Z');

const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All persons who bought the product.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare under penalty of perjury that the above is true.' },
  member_fields: [
    { field: 'legal_name', official_label: 'Full Name', required: true },
    { field: 'address.zip', official_label: 'ZIP Code', required: true },
  ],
  questions: [{ key: 'purchase_count', official_label: 'How many did you buy?', type: 'integer', required: true }],
  benefit_tiers: [
    { key: 'basic', official_label: 'Basic', proof: [] },
    { key: 'documented', official_label: 'With proof', proof: [{ kind: 'receipt', official_label: 'Receipt', required: true }] },
  ],
  payout_options: [{ value: 'check', official_label: 'Paper check' }],
});

const desk = { type: 'filing_desk', enabled: true } as const;
const email = { type: 'administrator_email', enabled: true, to: 'claims@admin.example.test', published_at_url: 'https://admin.example.test/contact' } as const;
const bulk = { type: 'administrator_bulk' as const, enabled: true, columns: [{ header: 'Name', source: { path: 'member.legal_name' } }] };
const api = { type: 'administrator_api', enabled: true, adapter: 'epiq' } as const;

function record(content: FilingPolicyContentInput, meta: Partial<FilingPolicyRecord> = {}): FilingPolicyRecord {
  return {
    ...FilingPolicyContentSchema.parse(content),
    id: POLICY,
    lawsuit_id: LAWSUIT,
    administrator_id: null,
    version: 1,
    status: 'approved',
    approved_by: '00000000-0000-4000-8000-0000000000e1',
    approved_at: '2026-11-01T00:00:00Z',
    ...meta,
  };
}

const allowed = (channels: FilingPolicyContentInput['channels'], extra: FilingPolicyContentInput = {}) =>
  record({ agent_filing: 'allowed', allowed_states: ['CA', 'NY'], channels, ...extra });

function policyOf(settlement: FilingPolicyRecord | null, more: Partial<Parameters<typeof resolveEffectivePolicy>[0]> = {}) {
  return resolveEffectivePolicy({
    settlementPolicy: settlement,
    administratorPolicy: null,
    settlementControls: null,
    administratorControls: null,
    thirdPartyFeeStatus: 'unknown',
    ...more,
  });
}

function input(over: Partial<LaneInput> = {}): LaneInput {
  return {
    now: NOW,
    policy: policyOf(allowed([desk])),
    settlement: { openForClaims: true, deadline: '2026-12-31' },
    spec: { id: SPEC_ID, version: 1, status: 'approved', content: SPEC },
    member: { state: 'CA' },
    needsDocuments: false,
    healthConsent: { required: false, given: null },
    desk: { openJobs: 0 },
    email: { configured: true },
    ...over,
  };
}

describe('chooseLane: settlement-wide checks, first failure stops', () => {
  it('defaults to self_file: no approved policy means agent filing is unknown', () => {
    const decision = chooseLane(input({ policy: DEFAULT_EFFECTIVE_POLICY }));
    expect(decision).toMatchObject({ lane: 'self_file', agent: false, channel: null, reasons: ['no_settlement_policy'], dueBy: null });
  });

  it.each([
    ['settlement_not_open', { settlement: { openForClaims: false, deadline: '2026-12-31' } }],
    ['kill_switch', { policy: policyOf(allowed([desk]), { settlementControls: { lawsuit_id: LAWSUIT, administrator_id: null, kill_switch: true, kill_switch_reason: 'x', objection_received_at: null } }) }],
    ['kill_switch', { policy: policyOf(allowed([desk]), { administratorControls: { lawsuit_id: null, administrator_id: 'a', kill_switch: true, kill_switch_reason: 'x', objection_received_at: null } }) }],
    ['objection_received', { policy: policyOf(allowed([desk]), { settlementControls: { lawsuit_id: LAWSUIT, administrator_id: null, kill_switch: false, kill_switch_reason: null, objection_received_at: '2026-11-10T00:00:00Z' } }) }],
    ['agent_filing_unknown', { policy: policyOf(record({ channels: [desk] })) }],
    ['agent_filing_prohibited', { policy: policyOf(record({ agent_filing: 'prohibited', channels: [desk] })) }],
    ['identity_check_unavailable', { policy: policyOf(allowed([desk], { identity_check_required: true })) }],
    ['no_approved_spec', { spec: null }],
    ['no_approved_spec', { spec: { id: SPEC_ID, version: 2, status: 'draft' as const, content: SPEC } }],
    ['agent_certification_not_allowed', { spec: { id: SPEC_ID, version: 1, status: 'approved' as const, content: { ...SPEC, requires_agent_certification: true } } }],
    ['state_not_covered', { member: { state: 'TX' } }],
    ['state_not_covered', { member: { state: null } }],
    ['health_consent_unavailable', { healthConsent: { required: true, given: true } }],
    ['no_channel_enabled', { policy: policyOf(allowed([{ ...desk, enabled: false }])) }],
  ])('%s', (reason, over) => {
    const decision = chooseLane(input(over as Partial<LaneInput>));
    expect(decision.lane).toBe('self_file');
    expect(decision.reasons).toEqual([reason]);
  });

  it('asks for health consent instead of stopping when the policy has the law firm’s text', () => {
    const policy = policyOf(allowed([desk], { health_sensitive: true, health_consent_text: 'I agree to share my health information.' }));
    expect(chooseLane(input({ policy, healthConsent: { required: true, given: null } })).lane).toBe('filing_desk');
    expect(chooseLane(input({ policy, healthConsent: { required: true, given: false } })).reasons).toEqual(['health_consent_declined']);
  });

  it('a spec whose deadline zone Intl does not know is no spec at all', () => {
    const content = { ...SPEC, deadline: { date: '2026-12-31', time_zone: 'Mars/Olympus', type: 'submit_online_by' as const } };
    expect(chooseLane(input({ spec: { id: SPEC_ID, version: 1, status: 'approved', content } })).reasons).toEqual(['no_approved_spec']);
  });
});

describe('chooseLane: channels in the policy’s order', () => {
  it('takes the first channel that can take the claim and lists the ones passed over', () => {
    const decision = chooseLane(input({ policy: policyOf(allowed([api, email, desk])) }));
    expect(decision.lane).toBe('administrator_email');
    expect(decision.reasons).toEqual(['channel_config_invalid']);
    expect(decision.policyId).toBe(POLICY);
  });

  it('keeps the law firm’s order rather than a fixed preference', () => {
    expect(chooseLane(input({ policy: policyOf(allowed([desk, email])) })).lane).toBe('filing_desk');
    expect(chooseLane(input({ policy: policyOf(allowed([email, desk])) })).lane).toBe('administrator_email');
  });

  it('never picks administrator_api while no adapter is registered', () => {
    const decision = chooseLane(input({ policy: policyOf(allowed([api])) }));
    expect(decision).toMatchObject({ lane: 'self_file', reasons: ['channel_config_invalid'] });
  });

  it('keeps the desk off when the official form shows a challenge, and at capacity', () => {
    const challenged = { ...SPEC, official_form: { ...SPEC.official_form, challenges: ['captcha' as const] } };
    expect(chooseLane(input({ spec: { id: SPEC_ID, version: 1, status: 'approved', content: challenged } })).reasons).toEqual(['form_has_challenge']);
    expect(chooseLane(input({ desk: { openJobs: 20 } })).reasons).toEqual(['desk_at_capacity']);
    expect(chooseLane(input({ desk: { openJobs: 19 } })).lane).toBe('filing_desk');
    expect(chooseLane(input({ desk: null })).reasons).toEqual(['desk_at_capacity']);
  });

  it('skips channels that cannot carry the proof the claim needs', () => {
    const decision = chooseLane(input({ needsDocuments: true, policy: policyOf(allowed([bulk, { ...email, attach_documents: false }, desk])) }));
    expect(decision.lane).toBe('filing_desk');
    expect(decision.reasons).toEqual(['channel_cannot_carry_documents', 'channel_cannot_carry_documents']);
  });

  it('skips email when Resend cannot send, and bulk columns the spec cannot fill', () => {
    expect(chooseLane(input({ email: { configured: false }, policy: policyOf(allowed([email])) })).reasons).toEqual(['email_not_configured']);
    const badBulk = { ...bulk, columns: [{ header: 'VIN', source: { path: 'answers.vin' } }] };
    expect(chooseLane(input({ policy: policyOf(allowed([badBulk])) })).reasons).toEqual(['channel_config_invalid']);
    expect(chooseLane(input({ policy: policyOf(allowed([bulk])) })).lane).toBe('administrator_bulk');
  });

  it('never throws: anything unreadable is self_file', () => {
    const decision = chooseLane({ ...input(), policy: null as never });
    expect(decision.lane).toBe('self_file');
    expect(decision.agent).toBe(false);
  });
});

describe('deadline cutoff and the desk SLA', () => {
  it('stops each channel after the deadline minus its buffer, counted in the deadline’s zone', () => {
    const lastDay = '2026-12-26'; // 2026-12-31 minus the desk's 5 days
    expect(chooseLane(input({ now: new Date('2026-12-26T16:00:00Z') })).lastDayForAgent).toBe(lastDay);
    expect(chooseLane(input({ now: new Date('2026-12-27T03:00:00Z') })).lane).toBe('filing_desk'); // still the 26th in New York
    expect(chooseLane(input({ now: new Date('2026-12-27T16:00:00Z') })).reasons).toEqual(['deadline_too_close']);
    const utc = { ...SPEC, deadline: { date: '2026-12-31', time_zone: 'UTC', type: 'submit_online_by' as const } };
    expect(chooseLane(input({ now: new Date('2026-12-27T03:00:00Z'), spec: { id: SPEC_ID, version: 1, status: 'approved', content: utc } })).reasons).toEqual([
      'deadline_too_close',
    ]);
  });

  it('falls back to a channel with a shorter buffer', () => {
    const decision = chooseLane(input({ now: new Date('2026-12-27T16:00:00Z'), policy: policyOf(allowed([desk, { ...email, min_days_before_deadline: 3 }])) }));
    expect(decision).toMatchObject({ lane: 'administrator_email', reasons: ['deadline_too_close'], lastDayForAgent: '2026-12-28' });
  });

  it('dues a desk job two business days out, never after the end of the last day', () => {
    expect(chooseLane(input()).dueBy).toBe('2026-11-16T15:00:00.000Z'); // Thursday -> Monday
    const close = chooseLane(input({ settlement: { openForClaims: true, deadline: '2026-11-20' } }));
    expect(close.lastDayForAgent).toBe('2026-11-15');
    expect(close.dueBy).toBe('2026-11-16T04:59:59.999Z'); // end of Sunday the 15th in New York
  });

  it('dues an email job at the end of its last day, and has no cutoff without a deadline', () => {
    expect(chooseLane(input({ policy: policyOf(allowed([email])) })).dueBy).toBe('2026-12-27T04:59:59.999Z');
    const open = chooseLane(input({ settlement: { openForClaims: true, deadline: null }, policy: policyOf(allowed([email])) }));
    expect(open).toMatchObject({ lane: 'administrator_email', lastDayForAgent: null, dueBy: null });
  });

  it('computes the dates the way the design says', () => {
    expect(effectiveDeadline('2026-12-31', '2026-12-15')).toBe('2026-12-15');
    expect(effectiveDeadline(null, '2026-12-15')).toBe('2026-12-15');
    expect(effectiveDeadline('2026-02-30', null)).toBeNull();
    expect(lastDayForAgent('2026-03-03', 5)).toBe('2026-02-26');
    expect(specTimeZone({ deadline: null })).toBe('America/New_York');
    expect(specTimeZone({ deadline: { time_zone: 'Nope/Zone' } })).toBeNull();
    expect(endOfDay('2026-07-04', 'America/New_York').toISOString()).toBe('2026-07-05T03:59:59.999Z');
    // Friday 15:00 UTC + 1 business day = Monday; capped by the end of Saturday.
    expect(addBusinessDaysCapped(new Date('2026-11-13T15:00:00Z'), 1, 'America/New_York', null).toISOString()).toBe('2026-11-16T15:00:00.000Z');
    expect(addBusinessDaysCapped(new Date('2026-11-13T15:00:00Z'), 1, 'America/New_York', '2026-11-14').toISOString()).toBe('2026-11-15T04:59:59.999Z');
  });
});

describe('toLaneView: what a member is told', () => {
  it('maps reasons to member-safe ones, once each, on self_file only', () => {
    const killed = chooseLane(input({ policy: policyOf(allowed([desk]), { settlementControls: { lawsuit_id: LAWSUIT, administrator_id: null, kill_switch: true, kill_switch_reason: 'objection call', objection_received_at: null } }) }));
    expect(toLaneView(killed, '2026-12-31')).toEqual({ lane: 'self_file', agent: false, reasons: ['not_offered_for_settlement'], last_day_for_agent: null, deadline: '2026-12-31' });
    const twice = chooseLane(input({ needsDocuments: true, policy: policyOf(allowed([bulk, { ...email, attach_documents: false }])) }));
    expect(toLaneView(twice, null).reasons).toEqual(['proof_not_supported']);
    const late = chooseLane(input({ now: new Date('2026-12-30T16:00:00Z') }));
    expect(toLaneView(late, '2026-12-31').reasons).toEqual(['deadline_too_close']);
  });

  it('shows no reasons on an agent lane, and the last day Lawsuit AI can take it', () => {
    const decision = chooseLane(input({ policy: policyOf(allowed([api, desk])) }));
    expect(toLaneView(decision, '2026-12-31')).toEqual({ lane: 'filing_desk', agent: true, reasons: [], last_day_for_agent: '2026-12-26', deadline: '2026-12-31' });
  });
});

describe('resolveEffectivePolicy: the administrator level only restricts', () => {
  const adminRecord = (content: FilingPolicyContentInput) =>
    record(content, { id: ADMIN_POLICY, lawsuit_id: null, administrator_id: '00000000-0000-4000-8000-0000000000d1' });

  it('gives the default plus the controls without an approved settlement version', () => {
    const p = policyOf(record({ agent_filing: 'allowed', allowed_states: ['CA'], channels: [desk] }, { status: 'draft' }), {
      settlementControls: { lawsuit_id: LAWSUIT, administrator_id: null, kill_switch: true, kill_switch_reason: 'x', objection_received_at: null },
      thirdPartyFeeStatus: 'barred',
    });
    expect(p).toMatchObject({ ...DEFAULT_EFFECTIVE_POLICY, kill_switch: true, kill_switch_scope: 'settlement', third_party_fee_status: 'barred' });
  });

  it('lets an administrator prohibit, add checks and narrow the states, never widen them', () => {
    const p = policyOf(allowed([desk, { ...email, enabled: false }]), {
      administratorPolicy: adminRecord({ agent_filing: 'prohibited', allowed_states: ['NY', 'TX'], identity_check_required: true, health_sensitive: true }),
    });
    expect(p).toMatchObject({ agent_filing: 'prohibited', allowed_states: ['NY'], identity_check_required: true, health_sensitive: true, administrator_policy_id: ADMIN_POLICY });
    expect(p.channels.map((c) => c.type)).toEqual(['filing_desk']);
    const unknownAdmin = policyOf(allowed([desk]), { administratorPolicy: adminRecord({ agent_filing: 'unknown' }) });
    expect(unknownAdmin.agent_filing).toBe('allowed');
    expect(unknownAdmin.allowed_states).toEqual(['CA', 'NY']);
    expect(intersectStates(null, null)).toBeNull();
    expect(intersectStates(['ca'], null)).toEqual(['CA']);
  });

  it('reads rows conservatively: a broken settlement version is none, a broken administrator version prohibits', () => {
    const broken = { id: POLICY, lawsuit_id: LAWSUIT, status: 'approved', version: 1, agent_filing: 'allowed', allowed_states: null, channels: [] };
    expect(policyRecordFromRow(broken, 'settlement')).toBeNull();
    expect(policyRecordFromRow({ ...broken, lawsuit_id: null, administrator_id: 'a' }, 'administrator')?.agent_filing).toBe('prohibited');
    expect(policyRecordFromRow({ ...broken, allowed_states: ['CA'] }, 'settlement')?.agent_filing).toBe('allowed');
  });
});

describe('packet facts the lane needs', () => {
  it('needs documents for a tier with required proof, or once any is stored', () => {
    expect(needsDocumentsFor(SPEC, 'documented')).toBe(true);
    expect(needsDocumentsFor(SPEC, 'basic')).toBe(false);
    expect(needsDocumentsFor(SPEC, null)).toBe(false);
    expect(needsDocumentsFor(SPEC, 'basic', 1)).toBe(true);
  });

  it('needs health consent for a sensitive policy or a flagged item of the tier', () => {
    const flagged = FilingSpecContentSchema.parse({ ...SPEC, questions: [{ key: 'diagnosis', official_label: 'Were you diagnosed?', type: 'yes_no', required: true, health_flag: true, tiers: ['documented'] }] });
    expect(healthConsentRequiredFor(flagged, 'documented', false)).toBe(true);
    expect(healthConsentRequiredFor(flagged, 'basic', false)).toBe(false);
    expect(healthConsentRequiredFor(SPEC, null, true)).toBe(true);
  });
});

describe('getChannelAdapter', () => {
  it('has a staff desk and bulk, and worker email and api channels', () => {
    expect(getChannelAdapter('filing_desk')).toMatchObject({ channel: 'filing_desk', mode: 'staff' });
    expect(getChannelAdapter('filing_desk').submit).toBeUndefined();
    expect(getChannelAdapter('administrator_bulk').mode).toBe('staff');
    expect(getChannelAdapter('administrator_email').mode).toBe('worker');
    expect(typeof getChannelAdapter('administrator_api').submit).toBe('function');
    expect(getChannelAdapter('administrator_api').supports({ config: api as never, spec: SPEC, needsDocuments: false })).toEqual({
      ok: false,
      reason: 'channel_config_invalid',
    });
    expect(() => getChannelAdapter('fax' as never)).toThrow();
  });
});
