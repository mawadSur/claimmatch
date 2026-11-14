import { describe, expect, it } from 'vitest';
import { checkAnswerShape, mergeMemberSnapshot, validateAnswer } from '@/lib/filing/v2/answers';
import { agentAuthorizationText, AGENT_AUTHORIZATION_VERSION, authorizationTextFor } from '@/lib/filing/v2/authorization-text';
import { evaluateCondition, questionVisible, type ConditionContext } from '@/lib/filing/v2/conditions';
import { AGENT_CHANNELS, CanonicalPacketSchema, PacketViewSchema, type PacketDraft } from '@/lib/filing/v2/contract';
import { FilingSpecContentSchema, type SpecQuestion } from '@/lib/filing/v2/contract-spec';
import { memberDocumentPath, mimeMatches, sniffDocumentMime } from '@/lib/filing/v2/documents';
import { ESIGN_TEXT_V1, ESIGN_TEXT_VERSION, esignText, esignTextSha256 } from '@/lib/filing/v2/esign';
import { freshSignInFromClaims } from '@/lib/filing/v2/fresh-sign-in';
import {
  buildPacketDraft,
  buildPacketView,
  canonicalJson,
  computePacketHash,
  sha256Hex,
  toCanonicalPacket,
  type BuildPacketDraftInput,
} from '@/lib/filing/v2/packet';
import { PDF_BYTES, PNG_BYTES, SPEC_CONTENT, SPEC_ID, LAWSUIT, USER_A } from './filing-v2-fixtures';

const CLAIM = '00000000-0000-4000-8000-0000000000c1';
const SPEC = { id: SPEC_ID, version: 1, content: SPEC_CONTENT };
const HASHES = { class_definition_sha256: sha256Hex(SPEC_CONTENT.class_definition.text), attestation_sha256: sha256Hex(SPEC_CONTENT.attestation.text) };
const PROFILE = {
  full_name: 'Ada Lovelace',
  email: 'ada@example.test',
  phone: '555-0100',
  address_line1: '1 Main St',
  address_line2: null,
  city: 'Springfield',
  state: 'CA',
  zip: '94110',
};
const RECEIPT = { id: '00000000-0000-4000-8000-000000000d01', kind: 'receipt', sha256: 'b'.repeat(64), mime: 'image/png', size_bytes: 1200, status: 'stored', source: 'member' };

function input(row: Partial<BuildPacketDraftInput['row']> = {}, extra: Partial<BuildPacketDraftInput> = {}): BuildPacketDraftInput {
  return {
    claim: { id: CLAIM, lawsuit_id: LAWSUIT },
    spec: SPEC,
    row: {
      answers: {},
      member_snapshot: {},
      benefit_tier: null,
      payout_method: null,
      class_definition_confirmed_at: null,
      health_consent_at: null,
      ...row,
    },
    profile: PROFILE,
    documents: [],
    hashes: HASHES,
    ...extra,
  };
}

const COMPLETE_ROW = {
  answers: { purchase_count: 2 },
  benefit_tier: 'basic',
  payout_method: 'check',
  class_definition_confirmed_at: '2026-11-14T15:00:00.000Z',
};

describe('canonical JSON and the packet hash', () => {
  it('sorts keys at every level, keeps array order and adds no whitespace', () => {
    expect(canonicalJson({ b: 1, a: [3, { d: true, c: null }], é: 'x' })).toBe('{"a":[3,{"c":null,"d":true}],"b":1,"é":"x"}');
    expect(canonicalJson({ z: ' "\\', n: -0, f: 1.5e21 })).toBe('{"f":1.5e+21,"n":0,"z":" \\"\\\\"}');
  });

  it('refuses what JSON cannot say exactly', () => {
    expect(() => canonicalJson({ n: Number.NaN } as never)).toThrow();
    expect(() => canonicalJson({ n: Infinity } as never)).toThrow();
    expect(() => canonicalJson({ u: undefined } as never)).toThrow();
    expect(() => canonicalJson([1, undefined] as never)).toThrow();
    expect(() => canonicalJson({ d: new Date() } as never)).toThrow();
    expect(() => canonicalJson({ f: (() => 1) as never })).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle as never)).toThrow();
    expect(() => canonicalJson({ s: 'José' })).toThrow(/NFC/);
  });

  it('hashes UTF-8 bytes as lowercase hex', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('é')).toBe(sha256Hex('é'));
  });

  it('gives the same hash whatever order the packet was built in', () => {
    const result = toCanonicalPacket(buildPacketDraft(input(COMPLETE_ROW)), SPEC_CONTENT);
    if (!result.ok) throw new Error(result.missing.join());
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]))
          : v;
    const shuffled = reverseKeys(result.packet) as typeof result.packet;
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(result.packet));
    expect(computePacketHash(shuffled)).toBe(computePacketHash(result.packet));
    expect(computePacketHash(result.packet)).toBe(sha256Hex(canonicalJson(result.packet as never)));
  });
});

describe('buildPacketDraft', () => {
  it('fills the member block from the profile, with the member’s own edits winning', () => {
    const draft = buildPacketDraft(input({ member_snapshot: { legal_name: '  Ada  King ', phone: null, address: { zip: '10001' } } }));
    expect(draft.member).toEqual({
      legal_name: 'Ada  King',
      first_name: null,
      last_name: null,
      email: 'ada@example.test',
      phone: null,
      address: { line1: '1 Main St', line2: null, city: 'Springfield', state: 'CA', zip: '10001' },
    });
  });

  it('carries only the member fields the official form asks for (plus contact fields)', () => {
    expect(buildPacketDraft(input()).member.phone).toBeNull();
    expect(buildPacketDraft(input({}, { spec: null })).member.phone).toBe('555-0100');
    const withPhone = FilingSpecContentSchema.parse({
      ...SPEC_CONTENT,
      member_fields: [...SPEC_CONTENT.member_fields, { field: 'phone', official_label: 'Phone Number', required: false }],
    });
    expect(buildPacketDraft({ ...input(), spec: { ...SPEC, content: withPhone } }).member.phone).toBe('555-0100');
  });

  it('never invents a value: unusable profile values stay empty', () => {
    const draft = buildPacketDraft(input({}, { profile: { ...PROFILE, zip: '9411', email: 'not-an-email', state: 'California' } }));
    expect(draft.member.address.zip).toBeNull();
    expect(draft.member.email).toBeNull();
    expect(draft.member.address.state).toBeNull();
  });

  it('keeps only the spec’s questions, normalized, and drops answers that no longer fit', () => {
    const draft = buildPacketDraft(
      input({ answers: { purchase_count: 'two' as never, store: ' online ', unknown_key: 'x', side_effects: true } }),
    );
    expect(draft.answers).toEqual({ store: 'online', side_effects: true });
    expect(draft.answers).not.toHaveProperty('unknown_key');
    expect(draft.spec).toEqual({ id: SPEC_ID, version: 1 });
  });

  it('uses stored member uploads of the chosen tier’s proof only, sorted', () => {
    const second = { ...RECEIPT, id: '00000000-0000-4000-8000-000000000d02', sha256: 'a'.repeat(64) };
    const docs = [RECEIPT, second, { ...RECEIPT, id: 'p', status: 'pending_upload' }, { ...RECEIPT, id: 's', source: 'staff_evidence' }];
    expect(buildPacketDraft(input({ benefit_tier: 'basic' }, { documents: docs })).documents).toEqual([]);
    const draft = buildPacketDraft(input({ benefit_tier: 'documented' }, { documents: docs }));
    expect(draft.documents.map((d) => d.id)).toEqual([second.id, RECEIPT.id]);
  });

  it('has no spec hashes and no answers without a spec', () => {
    const draft = buildPacketDraft(input({ answers: { purchase_count: 2 } }, { spec: null, hashes: { class_definition_sha256: null, attestation_sha256: null } }));
    expect(draft.answers).toEqual({});
    expect(draft.attestation_sha256).toBeNull();
    expect(draft.confirmations).toEqual({ class_definition: false, health_data_consent: null });
  });
});

describe('toCanonicalPacket', () => {
  it('lists what is still missing', () => {
    const result = toCanonicalPacket(buildPacketDraft(input({ benefit_tier: 'documented' }, { profile: { ...PROFILE, zip: null } })), SPEC_CONTENT);
    expect(result).toEqual({
      ok: false,
      missing: ['member.address.zip', 'answers.purchase_count', 'payout_method', 'documents.receipt', 'confirmations.class_definition'],
    });
  });

  it('builds the signed shape once complete, with answers to asked questions only', () => {
    const spec = FilingSpecContentSchema.parse({
      ...SPEC_CONTENT,
      questions: [
        ...SPEC_CONTENT.questions,
        { key: 'store_name', official_label: 'Store name', type: 'text', required: true, visible_when: { field: 'answers.store', op: 'eq', value: 'in_store' } },
      ],
    });
    const draft = buildPacketDraft({ ...input({ ...COMPLETE_ROW, answers: { purchase_count: 2, store: 'online', store_name: 'Old answer' } }), spec: { ...SPEC, content: spec } });
    const result = toCanonicalPacket(draft, spec);
    if (!result.ok) throw new Error(result.missing.join());
    expect(result.packet.answers).toEqual({ purchase_count: 2, store: 'online' });
    expect(CanonicalPacketSchema.safeParse(result.packet).success).toBe(true);
    expect(result.packet.confirmations).toEqual({ class_definition: true, health_data_consent: null });
  });

  it('needs health consent when the member’s tier asks health data', () => {
    const row = { ...COMPLETE_ROW, benefit_tier: 'injury', answers: { purchase_count: 2, side_effects: false } };
    expect(toCanonicalPacket(buildPacketDraft(input(row)), SPEC_CONTENT)).toEqual({ ok: false, missing: ['confirmations.health_data_consent'] });
    const consented = buildPacketDraft(input({ ...row, health_consent_at: '2026-11-14T15:00:00Z' }));
    const result = toCanonicalPacket(consented, SPEC_CONTENT);
    expect(result.ok && result.packet.answers).toEqual({ purchase_count: 2, side_effects: false });
    expect(result.ok && result.packet.confirmations).toEqual({ class_definition: true, health_data_consent: true });
  });

  it('requires the documents the tier asks for, within its limits', () => {
    const docs = [RECEIPT, { ...RECEIPT, id: '2' }, { ...RECEIPT, id: '3' }];
    const row = { ...COMPLETE_ROW, benefit_tier: 'documented' };
    expect(toCanonicalPacket(buildPacketDraft(input(row, { documents: [RECEIPT] })), SPEC_CONTENT).ok).toBe(true);
    expect(toCanonicalPacket(buildPacketDraft(input(row, { documents: docs })), SPEC_CONTENT)).toEqual({ ok: false, missing: ['documents.receipt'] });
  });
});

describe('buildPacketView', () => {
  const draft = buildPacketDraft(input({ benefit_tier: 'documented', answers: { purchase_count: 2, side_effects: true }, health_consent_at: null }));
  const injuryDraft = buildPacketDraft(input({ benefit_tier: 'injury', answers: { side_effects: true } }));
  const viewInput: Parameters<typeof buildPacketView>[0] = {
    packet: { id: '00000000-0000-4000-8000-0000000000b1', status: 'open', revision: 3, packet_hash: null },
    draft,
    spec: SPEC,
    jev: {
      engine_version: 'jev-1',
      mode: 'partial',
      outcome: 'warn',
      issues: [
        { rule_id: 'x.count', source: 'settlement', severity: 'warn', code: 'too_many', message: 'Check the count.', field: 'answers.purchase_count', audience: 'member' },
        { rule_id: 'global.duplicate_identity', source: 'global', severity: 'warn', code: 'duplicate_identity', message: 'Same person on two accounts', field: null, audience: 'staff' },
      ],
      counts: { block: 0, warn: 2, info: 0 },
      rule_set_hash: 'a'.repeat(64),
      packet_hash: null,
      evaluated_at: '2026-11-14T15:00:00.000Z',
    },
    documents: [],
    healthConsentText: 'Consent text',
    lane: 'filing_desk',
    profileConsentGiven: false,
  };
  const view = buildPacketView(viewInput);

  it('matches the contract and follows the official form’s order', () => {
    expect(PacketViewSchema.safeParse(view).success).toBe(true);
    expect(view.items.slice(0, 5).map((i) => i.path)).toEqual(['member.legal_name', 'member.email', 'answers.purchase_count', 'benefit_tier', 'documents.receipt']);
    expect(view.items.find((i) => i.path === 'documents.receipt')).toMatchObject({ kind: 'document', missing: true, proof: { min_files: 1, max_files: 2 } });
  });

  it('shows member-audience issues only, and locks health items until consent', () => {
    expect(view.jev?.issues.map((i) => i.rule_id)).toEqual(['x.count']);
    expect(JSON.stringify(view)).not.toContain('Same person on two accounts');
    expect(view.items.find((i) => i.path === 'answers.purchase_count')?.issues).toHaveLength(1);
    expect(view.items.find((i) => i.path === 'answers.side_effects')).toBeUndefined();
    const injury = buildPacketView({ ...viewInput, draft: injuryDraft });
    expect(injury.items.find((i) => i.path === 'answers.side_effects')).toMatchObject({ health_flag: true, locked: 'health_consent_needed' });
    expect(buildPacketView({ ...viewInput, draft: injuryDraft, healthConsentText: null }).items.find((i) => i.path === 'answers.side_effects')?.locked).toBe('not_collected');
    expect(view.spec?.attestation_text).toBe(SPEC_CONTENT.attestation.text);
    expect(view.complete).toBe(false);
  });
});

describe('visible_when conditions', () => {
  const ctx = (answers: PacketDraft['answers']): ConditionContext => ({
    packet: { ...buildPacketDraft(input({ answers })), answers },
    daysToDeadline: 3,
    lane: 'filing_desk',
  });

  it('reads missing values as missing, never as matching', () => {
    expect(evaluateCondition({ field: 'answers.store', op: 'eq', value: 'online' }, ctx({}))).toBe(false);
    expect(evaluateCondition({ field: 'answers.store', op: 'neq', value: 'online' }, ctx({}))).toBe(true);
    expect(evaluateCondition({ field: 'answers.store', op: 'absent' }, ctx({ store: '  ' }))).toBe(true);
    expect(evaluateCondition({ field: 'answers.n', op: 'gt', value: 1 }, ctx({}))).toBe(false);
  });

  it('supports every operator', () => {
    const c = ctx({ n: 4, d: '2026-01-02', s: 'ABC-123', m: ['a', 'b'], yes: true, t: 'ABC-123' });
    const holds = (cond: Parameters<typeof evaluateCondition>[0]) => evaluateCondition(cond, c);
    expect(holds({ all: [{ field: 'answers.n', op: 'gte', value: 4 }, { field: 'answers.n', op: 'lt', value: 5 }] })).toBe(true);
    expect(holds({ any: [{ field: 'answers.n', op: 'lte', value: 1 }, { field: 'answers.yes', op: 'is_true' }] })).toBe(true);
    expect(holds({ not: { field: 'answers.yes', op: 'is_false' } })).toBe(true);
    expect(holds({ field: 'answers.m', op: 'in', values: ['b', 'z'] })).toBe(true);
    expect(holds({ field: 'answers.m', op: 'not_in', values: ['z'] })).toBe(true);
    expect(holds({ field: 'answers.d', op: 'date_before', value: '2026-02-01' })).toBe(true);
    expect(holds({ field: 'answers.d', op: 'date_on_or_after', value: '2026-02-01' })).toBe(false);
    expect(holds({ field: 'answers.s', op: 'length_between', min: 1, max: 7 })).toBe(true);
    expect(holds({ field: 'answers.s', op: 'matches', pattern: '^[A-Z]{3}-\\d+$' })).toBe(true);
    expect(holds({ field: 'answers.s', op: 'matches', pattern: '(' })).toBe(false);
    expect(holds({ field: 'answers.s', op: 'eq_field', other: 'answers.t' })).toBe(true);
    expect(holds({ field: 'meta.days_to_deadline', op: 'lte', value: 5 })).toBe(true);
    expect(holds({ field: 'meta.lane', op: 'eq', value: 'filing_desk' })).toBe(true);
    expect(holds({ field: 'member.address.state', op: 'eq', value: 'CA' })).toBe(true);
  });

  it('asks exactly what Jev checks: no upload yet is absent, and a condition that cannot run asks the question', () => {
    const none = ctx({});
    expect(evaluateCondition({ field: 'doc_count.receipt', op: 'absent' }, none)).toBe(true);
    expect(evaluateCondition({ field: 'doc_count.receipt', op: 'present' }, none)).toBe(false);
    expect(evaluateCondition({ field: 'doc_count.receipt', op: 'lt', value: 1 }, none)).toBe(true);
    expect(questionVisible({ field: 'doc_count.receipt', op: 'present' }, none)).toBe(false);
    expect(questionVisible({ field: 'answers.s', op: 'matches', pattern: '(a+)+$' }, none)).toBe(true);
    expect(questionVisible(null, none)).toBe(true);
  });
});

describe('answers at the boundary', () => {
  const q = (over: Partial<SpecQuestion>): SpecQuestion =>
    ({ key: 'k', official_label: 'Q', help: null, type: 'text', required: false, options: null, validation: null, visible_when: null, tiers: null, health_flag: false, ...over }) as SpecQuestion;

  it('checks each type and normalizes', () => {
    expect(validateAnswer(q({ type: 'integer' }), 2.5)).toEqual({ ok: false, message: 'Enter a whole number.' });
    expect(validateAnswer(q({ type: 'date' }), '2026-02-30')).toMatchObject({ ok: false });
    expect(validateAnswer(q({ type: 'money' }), '12.345')).toMatchObject({ ok: false });
    expect(validateAnswer(q({ type: 'vin' }), ' 1hgcm82633a004352 ')).toEqual({ ok: true, value: '1HGCM82633A004352' });
    expect(validateAnswer(q({ type: 'us_state' }), 'ny')).toEqual({ ok: true, value: 'NY' });
    expect(validateAnswer(q({ type: 'zip' }), '1234')).toMatchObject({ ok: false });
    expect(validateAnswer(q({ type: 'email' }), 'a@b.co')).toEqual({ ok: true, value: 'a@b.co' });
    expect(validateAnswer(q({ type: 'yes_no' }), 'yes')).toMatchObject({ ok: false });
    expect(validateAnswer(q({ type: 'text' }), '   ')).toEqual({ ok: true, value: null });
    const choice = q({ type: 'multi_choice', options: [{ value: 'a', official_label: 'A' }, { value: 'b', official_label: 'B' }] });
    expect(validateAnswer(choice, ['b', 'a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
    expect(validateAnswer(choice, ['c'])).toMatchObject({ ok: false });
    expect(checkAnswerShape(q({ type: 'single_choice', options: [{ value: 'a', official_label: 'A' }] }), 'z')).toMatchObject({ ok: false });
  });

  it('applies the spec’s validation', () => {
    const count = q({ type: 'integer', validation: { min: 1, max: 10 } });
    expect(validateAnswer(count, 0)).toEqual({ ok: false, message: 'Must be at least 1.' });
    expect(validateAnswer(count, 11)).toEqual({ ok: false, message: 'Must be at most 10.' });
    const code = q({ validation: { pattern: '^[A-Z]{2}\\d{4}$', pattern_hint: 'Two letters and four digits.' } });
    expect(validateAnswer(code, 'ab1234')).toEqual({ ok: false, message: 'Two letters and four digits.' });
    expect(validateAnswer(code, 'AB1234')).toEqual({ ok: true, value: 'AB1234' });
  });

  it('merges member edits, null clearing a field', () => {
    expect(mergeMemberSnapshot({ phone: '1', address: { city: 'X' } }, { phone: null, address: { state: 'ny' } })).toEqual({
      phone: null,
      address: { city: 'X', state: 'NY' },
    });
  });
});

describe('documents', () => {
  it('trusts the bytes, not the label', () => {
    expect(sniffDocumentMime(PNG_BYTES)).toBe('image/png');
    expect(sniffDocumentMime(PDF_BYTES)).toBe('application/pdf');
    expect(sniffDocumentMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffDocumentMime(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffDocumentMime(new TextEncoder().encode('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('image/heic');
    expect(sniffDocumentMime(new TextEncoder().encode('<html>'))).toBeNull();
    expect(mimeMatches('image/heif', 'image/heic')).toBe(true);
    expect(mimeMatches('image/png', 'image/jpeg')).toBe(false);
  });

  it('stores member files under {user_id}/{claim_id}/', () => {
    expect(memberDocumentPath(USER_A, CLAIM, 'doc', 'application/pdf')).toBe(`${USER_A}/${CLAIM}/doc.pdf`);
  });
});

describe('fresh sign-in', () => {
  const now = new Date('2026-11-14T15:00:00Z');
  const at = (secondsAgo: number) => Math.floor(now.getTime() / 1000) - secondsAgo;

  it('counts a password, OAuth or MFA sign-in within 15 minutes only', () => {
    expect(freshSignInFromClaims({ sub: USER_A, session_id: 's', amr: [{ method: 'password', timestamp: at(60) }] }, USER_A, now)).toMatchObject({ fresh: true, method: 'password', sessionId: 's' });
    expect(freshSignInFromClaims({ sub: USER_A, amr: [{ method: 'password', timestamp: at(901) }] }, USER_A, now)).toEqual({ fresh: false, reason: 'stale' });
    expect(freshSignInFromClaims({ sub: USER_A, amr: [{ method: 'mfa/totp', timestamp: at(10) }] }, USER_A, now).fresh).toBe(true);
  });

  it('never counts email links, string-only amr, or another user’s token', () => {
    for (const method of ['magiclink', 'otp', 'recovery', 'invite']) {
      expect(freshSignInFromClaims({ sub: USER_A, amr: [{ method, timestamp: at(5) }] }, USER_A, now).fresh).toBe(false);
    }
    expect(freshSignInFromClaims({ sub: USER_A, amr: ['password'] }, USER_A, now).fresh).toBe(false);
    expect(freshSignInFromClaims({ sub: 'other', amr: [{ method: 'password', timestamp: at(5) }] }, USER_A, now).fresh).toBe(false);
  });
});

describe('versioned texts', () => {
  it('hashes the E-SIGN text as esign_consents checks it', () => {
    expect(esignText(ESIGN_TEXT_VERSION)).toBe(ESIGN_TEXT_V1);
    expect(esignText('esign-v0')).toBeNull();
    expect(esignTextSha256()).toBe(sha256Hex(ESIGN_TEXT_V1));
    expect(ESIGN_TEXT_V1).toMatch(/paper copy/i);
    expect(ESIGN_TEXT_V1).toMatch(/withdraw/i);
  });

  it('authorizes one claim through the named lane, with payment to the member', () => {
    for (const lane of AGENT_CHANNELS) {
      const text = agentAuthorizationText(lane);
      expect(text).toContain('this one claim');
      expect(text).toContain('comes to me directly from the settlement administrator');
      expect(text).toContain('payment is not guaranteed');
      expect(text).toContain('Filing a claim myself on the official settlement site is free');
      expect(authorizationTextFor(AGENT_AUTHORIZATION_VERSION, lane)).toBe(text);
    }
    expect(new Set(AGENT_CHANNELS.map(agentAuthorizationText)).size).toBe(AGENT_CHANNELS.length);
    expect(authorizationTextFor('agent-auth-v0', 'filing_desk')).toBeNull();
  });
});
