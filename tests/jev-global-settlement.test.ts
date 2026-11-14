import { describe, expect, it } from 'vitest';
import { runJev } from '@/lib/jev';
import type { ChannelConfig, Lane } from '@/lib/filing/v2/contract';
import {
  API,
  BULK,
  DESK,
  EMAIL,
  agentPolicy,
  channel,
  codes,
  find,
  hashOf,
  jevInput,
  preSend,
  sha,
  signatureFor,
  specContent,
} from './jev-fixtures';

const settlement = (daysToDeadline: number | null, deadline: string | null = '2026-12-31', openForClaims = true) => ({
  openForClaims,
  deadline,
  daysToDeadline,
});

describe('global.settlement_open', () => {
  it('blocks a closed settlement, and one whose deadline has passed', () => {
    expect(find(runJev(jevInput({ settlement: settlement(49, '2026-12-31', false) })), 'settlement_closed')?.severity).toBe('block');
    const passed = runJev(jevInput({ lane: 'self_file', settlement: settlement(-1, '2026-11-11') }));
    expect(codes(passed)).toEqual(['deadline_passed']);
  });

  it('keeps a deadline that falls today open', () => {
    expect(runJev(jevInput({ lane: 'self_file', settlement: settlement(0, '2026-11-12') })).issues).toEqual([]);
  });
});

describe('global.lane_allowed', () => {
  const base = agentPolicy();
  it.each([
    ['kill_switch', { kill_switch: true, kill_switch_scope: 'administrator' as const }],
    ['objection_received', { objection_received_at: '2026-11-01T00:00:00Z' }],
    ['agent_filing_unknown', { agent_filing: 'unknown' as const }],
    ['agent_filing_prohibited', { agent_filing: 'prohibited' as const }],
    ['identity_check_unavailable', { identity_check_required: true }],
    ['no_channel_enabled', { channels: [EMAIL] }],
    ['no_channel_enabled', { channels: [{ ...DESK, enabled: false } as ChannelConfig] }],
  ])('blocks for %s, telling the member only that it is not offered', (code, change) => {
    const result = runJev(jevInput({ policy: { ...base, ...change } }));
    expect(codes(result, 'staff')).toContain(code);
    expect(codes(result, 'member')).toEqual(['not_offered_for_settlement']);
  });

  it('needs the policy to allow agent certification when the official form asks the submitter to certify', () => {
    const content = specContent({ requires_agent_certification: true });
    expect(codes(runJev(jevInput({}, { content })), 'staff')).toContain('agent_certification_not_allowed');
    expect(runJev(jevInput({ policy: { ...base, agent_certification_allowed: true } }, { content })).issues).toEqual([]);
  });

  it('does not apply on the self-file lane or while filling', () => {
    const killed = { ...base, kill_switch: true };
    expect(runJev(jevInput({ lane: 'self_file', policy: killed })).issues).toEqual([]);
    expect(runJev(jevInput({ mode: 'partial', policy: killed })).issues).toEqual([]);
  });
});

describe('global.spec_approved', () => {
  it('blocks without an approved spec', () => {
    expect(codes(runJev(jevInput({ spec: null })))).toContain('no_approved_spec');
  });

  it('accepts a superseded spec only right before sending, never a retired one', () => {
    const superseded = (input: ReturnType<typeof jevInput>) => ({ ...input, spec: { ...input.spec!, status: 'superseded' as const } });
    const signing = runJev(superseded(jevInput()));
    expect(find(signing, 'spec_not_approved')?.message).toMatch(/Review your claim again/);
    expect(runJev(superseded(preSend())).issues).toEqual([]);
    const retired = preSend();
    const result = runJev({ ...retired, spec: { ...retired.spec!, status: 'retired' } });
    expect(find(result, 'spec_not_approved')?.message).toMatch(/no longer in use/);
    expect(find(result, 'spec_not_approved', 'staff')?.message).toContain('retired');
  });

  it('blocks a packet built on another spec version or with another statement hash', () => {
    expect(codes(runJev(jevInput({}, { packet: { spec: { id: jevInput().spec!.id, version: 2 } } })))).toContain('spec_changed');
    expect(codes(runJev(jevInput({}, { packet: { spec: null } })))).toContain('spec_changed');
    expect(codes(runJev(jevInput({}, { packet: { attestation_sha256: sha('another statement') } })))).toContain('statement_text_changed');
  });
});

describe('global.deadline_cutoff (calendar days, as chooseLane counts them)', () => {
  const on = (lane: Lane, days: number, channels: ChannelConfig[] = [DESK, EMAIL, BULK, API]) =>
    runJev(jevInput({ lane, policy: agentPolicy({ channels }), settlement: settlement(days) }));

  it.each([
    ['filing_desk', 5],
    ['administrator_email', 5],
    ['administrator_bulk', 7],
    ['administrator_api', 3],
  ] as const)('%s takes the claim through day -%i and not after', (lane, min) => {
    expect(codes(on(lane, min))).not.toContain('deadline_too_close');
    const late = on(lane, min - 1);
    expect(find(late, 'deadline_too_close')?.severity).toBe('block');
    expect(find(late, 'deadline_too_close', 'staff')?.message).toContain(`needs at least ${min}`);
  });

  it('uses the channel config when it sets its own cutoff', () => {
    const desk10 = channel({ type: 'filing_desk', enabled: true, min_days_before_deadline: 10 });
    expect(codes(on('filing_desk', 9, [desk10]))).toContain('deadline_too_close');
    expect(codes(on('filing_desk', 10, [desk10]))).not.toContain('deadline_too_close');
  });

  it('blocks agent lanes on the deadline day, but never applies to self-file or without a deadline', () => {
    expect(codes(on('filing_desk', 0))).toContain('deadline_too_close');
    expect(on('self_file', 0).issues).toEqual([]);
    expect(runJev(jevInput({ settlement: settlement(null, null) })).issues).toEqual([]);
  });

  it('does not repeat itself once the deadline has passed', () => {
    const result = on('filing_desk', -2);
    expect(codes(result)).toContain('deadline_passed');
    expect(codes(result)).not.toContain('deadline_too_close');
  });

  describe('business-day heads-up for staff channels', () => {
    const desk1 = channel({ type: 'filing_desk', enabled: true, min_days_before_deadline: 1 });
    const bulk1 = channel({ type: 'administrator_bulk', enabled: true, min_days_before_deadline: 1, columns: [{ header: 'Name', source: { path: 'member.legal_name' } }] });
    const email1 = channel({ type: 'administrator_email', enabled: true, min_days_before_deadline: 1, to: 'claims@administrator.example.test', published_at_url: 'https://administrator.example.test/contact' });
    // Monday 2026-11-16 deadline; Saturday 2026-11-14 is 2 calendar days and 1 business day before it.
    const weekend = (lane: Lane, ch: ChannelConfig, mode: 'pre_sign' | 'pre_send' = 'pre_send') =>
      runJev(
        mode === 'pre_send'
          ? preSend({ lane, policy: agentPolicy({ channels: [ch] }), now: '2026-11-14T16:00:00Z', settlement: settlement(2, '2026-11-16') })
          : jevInput({ lane, policy: agentPolicy({ channels: [ch] }), now: '2026-11-14T16:00:00Z', settlement: settlement(2, '2026-11-16') }),
      );

    it('warns staff when a weekend leaves fewer business days than the desk SLA', () => {
      const result = weekend('filing_desk', desk1);
      expect(result.outcome).toBe('warn');
      expect(find(result, 'deadline_business_days_tight', 'staff')?.message).toContain('Only 1 business day(s) left through the submit_online_by deadline on 2026-11-16 (America/New_York)');
      expect(codes(result, 'member')).toEqual([]);
      expect(codes(weekend('administrator_bulk', bulk1, 'pre_sign'), 'staff')).toContain('deadline_business_days_tight');
    });

    it('counts Friday and Monday as two business days, and never warns for email', () => {
      const friday = runJev(preSend({ policy: agentPolicy({ channels: [desk1] }), now: '2026-11-13T16:00:00Z', settlement: settlement(3, '2026-11-16') }));
      expect(friday.issues).toEqual([]);
      expect(weekend('administrator_email', email1).issues).toEqual([]);
    });
  });

  it('counts in the spec zone and tells staff when the zone is unknown', () => {
    const content = specContent({ deadline: { date: '2026-12-31', time_zone: 'Mars/Olympus_Mons', type: 'received_by' } });
    const result = runJev(jevInput({ settlement: settlement(null) }, { content }));
    expect(find(result, 'spec_time_zone_invalid', 'staff')?.message).toContain('Mars/Olympus_Mons');
    expect(result.outcome).toBe('warn');
  });
});

describe('global.allowed_states', () => {
  it('blocks a member state the law firm does not cover, on agent lanes only', () => {
    const result = runJev(jevInput({}, { address: { state: 'NV' } }));
    expect(codes(result, 'member')).toEqual(['state_not_covered']);
    expect(find(result, 'state_not_covered', 'staff')?.message).toContain('NV');
    expect(runJev(jevInput({ lane: 'self_file' }, { address: { state: 'NV' } })).issues).toEqual([]);
    expect(runJev(jevInput({ policy: agentPolicy({ allowed_states: null }) }, { address: { state: 'NV' } })).issues).toEqual([]);
  });

  it('leaves a missing state to the address rule', () => {
    const result = runJev(jevInput({}, { address: { state: null } }));
    expect(codes(result)).toEqual(['required_missing']);
  });
});

describe('global.class_definition_confirmed', () => {
  it('needs the member’s own confirmation of this exact class definition', () => {
    const unconfirmed = { packet: { confirmations: { class_definition: false, health_data_consent: null } } };
    expect(codes(runJev(jevInput({}, unconfirmed)))).toEqual(['class_definition_not_confirmed']);
    expect(codes(runJev(jevInput({}, { packet: { class_definition_sha256: sha('older text') } })), 'member')).toEqual(['class_definition_changed']);
  });
});

describe('global.signature_binding and global.statement_unchanged (pre_send)', () => {
  it('blocks a missing or voided signature', () => {
    expect(codes(runJev(preSend({ signature: null })))).toEqual(['signature_missing']);
    const input = preSend();
    expect(codes(runJev({ ...input, signature: { ...input.signature!, voided: true } }))).toEqual(['signature_voided']);
  });

  it('blocks when the packet changed after signing (hash recomputed now)', () => {
    const signed = preSend();
    const changed = { ...signed.packet, answers: { ...signed.packet.answers, item_count: 4 } };
    const result = runJev({ ...signed, packet: changed, packetHash: hashOf(changed) });
    expect(codes(result, 'member')).toEqual(['signature_hash_mismatch']);
    expect(runJev({ ...signed, packetHash: null }).issues.map((i) => i.code)).toContain('packet_hash_missing');
  });

  it('blocks a signature made for another lane', () => {
    const input = preSend();
    const result = runJev({ ...input, signature: signatureFor(input, { lane: 'administrator_email' }) });
    expect(find(result, 'signature_lane_mismatch', 'staff')?.message).toContain('administrator_email');
  });

  it('compares the typed name with normalizeTypedName', () => {
    const input = preSend({}, { member: { legal_name: 'Zoë Lovelace' } });
    const typed = (name: string) => runJev({ ...input, signature: signatureFor(input, { typed_name: name }) });
    expect(typed('  zoë   LOVELACE ').issues).toEqual([]);
    expect(codes(typed('Zoe Lovelace'))).toEqual(['typed_name_mismatch']);
  });

  it('blocks when the signed statement is not the spec’s statement', () => {
    const input = preSend();
    const result = runJev({ ...input, signature: signatureFor(input, { statement_sha256: sha('an older statement') }) });
    expect(codes(result, 'member')).toEqual(['statement_changed']);
  });
});

describe('global.duplicate_identity', () => {
  it('warns staff only, and only right before sending', () => {
    const result = runJev(preSend({ duplicates: { sameIdentityOtherAccounts: 3 } }));
    expect(result.issues).toEqual([expect.objectContaining({ code: 'duplicate_identity', audience: 'staff', severity: 'warn' })]);
    expect(runJev(jevInput({ duplicates: { sameIdentityOtherAccounts: 3 } })).issues).toEqual([]);
    expect(runJev(preSend({ duplicates: { sameIdentityOtherAccounts: 0 } })).issues).toEqual([]);
  });
});
