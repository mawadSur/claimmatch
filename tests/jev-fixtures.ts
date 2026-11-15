/**
 * Shared fixtures for tests/jev-*.test.ts (not a test file itself): an
 * approved spec for a fictional "Acme Widgets" settlement, an agent-lane
 * policy on the filing desk, a complete packet that passes every check,
 * and small helpers to read results.
 */
import { createHash } from 'node:crypto';
import {
  ChannelConfigSchema,
  DEFAULT_EFFECTIVE_POLICY,
  FilingSpecContentSchema,
  type ChannelConfig,
  type EffectiveFilingPolicy,
  type FilingSpecContent,
  type FilingSpecContentInput,
  type PacketDraft,
} from '@/lib/filing/v2/contract';
import { canonicalJsonOf } from '@/lib/jev/hash';
import type { JevInput, JevIssue, JevResult, JevRule, JevSignatureFacts } from '@/lib/jev/types';

export const CLAIM_ID = '00000000-0000-4000-8000-000000000001';
export const LAWSUIT_ID = '00000000-0000-4000-8000-000000000002';
export const SPEC_ID = '00000000-0000-4000-8000-000000000003';
export const POLICY_ID = '00000000-0000-4000-8000-000000000004';
export const DOC_ID = (n: number) => `00000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;

export function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export const SPEC_INPUT: FilingSpecContentInput = {
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: {
    text: 'All persons in the United States who bought Acme Widgets between January 1, 2020 and June 30, 2024.',
    source_url: 'https://official.example.test/notice',
  },
  attestation: { text: 'I declare under penalty of perjury that the information in this claim is true and correct.' },
  deadline: { date: '2026-12-31', time_zone: 'America/New_York', type: 'submit_online_by' },
  member_fields: [
    { field: 'legal_name', official_label: 'Full Name', required: true },
    { field: 'email', official_label: 'Email Address', required: true },
    { field: 'phone', official_label: 'Phone Number', required: false },
    { field: 'address.line1', official_label: 'Street Address', required: true },
    { field: 'address.city', official_label: 'City', required: true },
    { field: 'address.state', official_label: 'State', required: true },
    { field: 'address.zip', official_label: 'ZIP Code', required: true },
  ],
  questions: [
    { key: 'purchase_date', official_label: 'Date of purchase', type: 'date', required: true },
    {
      key: 'item_count',
      official_label: 'How many Acme Widgets did you buy?',
      type: 'integer',
      required: true,
      validation: { min: 1, max: 20 },
    },
    {
      key: 'store',
      official_label: 'Where did you buy them?',
      type: 'single_choice',
      required: false,
      options: [
        { value: 'online', official_label: 'Online' },
        { value: 'in_store', official_label: 'In a store' },
      ],
    },
    { key: 'notes', official_label: 'Anything else the administrator should know?', type: 'long_text', required: false },
    { key: 'proof_amount', official_label: 'Amount shown on your proof of purchase', type: 'money', required: true, tiers: ['with_proof'] },
  ],
  benefit_tiers: [
    { key: 'no_proof', official_label: 'Without proof of purchase', proof: [] },
    {
      key: 'with_proof',
      official_label: 'With proof of purchase',
      proof: [{ kind: 'purchase_proof', official_label: 'Proof of purchase', required: true, max_files: 2, accepted_mime: ['application/pdf', 'image/jpeg'] }],
    },
  ],
  payout_options: [
    { value: 'check', official_label: 'Paper check' },
    { value: 'paypal', official_label: 'PayPal' },
  ],
  form_field_order: [
    'member.legal_name',
    'member.email',
    'member.address.line1',
    'member.address.city',
    'member.address.state',
    'member.address.zip',
    'answers.purchase_date',
    'answers.item_count',
    'answers.store',
    'benefit_tier',
    'answers.proof_amount',
    'documents.purchase_proof',
    'payout_method',
  ],
  jev_rules: [],
};

export function specContent(overrides: Partial<FilingSpecContentInput> = {}): FilingSpecContent {
  return FilingSpecContentSchema.parse({ ...SPEC_INPUT, ...overrides });
}

export function withRules(rules: unknown[], overrides: Partial<FilingSpecContentInput> = {}): FilingSpecContent {
  return specContent({ ...overrides, jev_rules: rules as FilingSpecContentInput['jev_rules'] });
}

export function channel(config: Record<string, unknown>): ChannelConfig {
  return ChannelConfigSchema.parse(config);
}

export const DESK = channel({ type: 'filing_desk', enabled: true });
export const EMAIL = channel({
  type: 'administrator_email',
  enabled: true,
  to: 'claims@administrator.example.test',
  published_at_url: 'https://administrator.example.test/contact',
});
export const BULK = channel({ type: 'administrator_bulk', enabled: true, columns: [{ header: 'Name', source: { path: 'member.legal_name' } }] });
export const API = channel({ type: 'administrator_api', enabled: true, adapter: 'acme-admin' });

export function agentPolicy(overrides: Partial<EffectiveFilingPolicy> = {}): EffectiveFilingPolicy {
  return {
    ...DEFAULT_EFFECTIVE_POLICY,
    settlement_policy_id: POLICY_ID,
    agent_filing: 'allowed',
    channels: [DESK, EMAIL, BULK, API],
    allowed_states: ['CA', 'NY', 'TX'],
    ...overrides,
  };
}

export function packetFor(content: FilingSpecContent, overrides: Partial<PacketDraft> = {}): PacketDraft {
  return {
    format: 'claimmatch.packet.v1',
    claim_id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    spec: { id: SPEC_ID, version: 1 },
    member: {
      legal_name: 'Ada Lovelace',
      first_name: null,
      last_name: null,
      email: 'ada@example.com',
      phone: null,
      address: { line1: '12 Analytical Way', line2: null, city: 'Springfield', state: 'CA', zip: '94110' },
    },
    answers: { purchase_date: '2023-05-01', item_count: 3, store: 'online' },
    benefit_tier: 'no_proof',
    payout_method: 'check',
    documents: [],
    confirmations: { class_definition: true, health_data_consent: null },
    class_definition_sha256: sha(content.class_definition.text),
    attestation_sha256: sha(content.attestation.text),
    ...overrides,
  };
}

/** What computePacketHash would give: SHA-256 of the canonical JSON (a stand-in; Jev never computes it). */
export function hashOf(packet: PacketDraft): string {
  return sha(canonicalJsonOf(packet));
}

export interface InputOptions {
  content?: FilingSpecContent;
  packet?: Partial<PacketDraft>;
  member?: Partial<PacketDraft['member']>;
  address?: Partial<PacketDraft['member']['address']>;
  answers?: PacketDraft['answers'];
}

/** A pre_sign input on the filing desk that passes, with overrides. */
export function jevInput(overrides: Partial<JevInput> = {}, options: InputOptions = {}): JevInput {
  const content = options.content ?? specContent();
  const base = packetFor(content, options.packet);
  const packet: PacketDraft = {
    ...base,
    member: { ...base.member, ...options.member, address: { ...base.member.address, ...options.address } },
    answers: options.answers ?? base.answers,
  };
  return {
    mode: 'pre_sign',
    now: '2026-11-12T15:00:00Z',
    lane: 'filing_desk',
    packet,
    packetHash: hashOf(packet),
    spec: {
      id: SPEC_ID,
      version: 1,
      status: 'approved',
      content,
      attestation_sha256: sha(content.attestation.text),
      class_definition_sha256: sha(content.class_definition.text),
    },
    policy: agentPolicy(),
    settlement: { openForClaims: true, deadline: '2026-12-31', daysToDeadline: 49 },
    healthConsent: { required: false, textAvailable: false, given: false },
    signature: null,
    duplicates: null,
    ...overrides,
  };
}

/** The live signature of `input` as it stands (pre_send). */
export function signatureFor(input: JevInput, overrides: Partial<JevSignatureFacts> = {}): JevSignatureFacts {
  return {
    id: '00000000-0000-4000-8000-000000000009',
    packet_hash: input.packetHash ?? '',
    typed_name: input.packet.member.legal_name ?? '',
    statement_sha256: input.spec?.attestation_sha256 ?? '',
    lane: input.lane,
    voided: false,
    signed_at: '2026-11-12T14:00:00Z',
    ...overrides,
  };
}

export function preSend(overrides: Partial<JevInput> = {}, options: InputOptions = {}): JevInput {
  const input = jevInput({ mode: 'pre_send', ...overrides }, options);
  return { ...input, signature: overrides.signature === undefined ? signatureFor(input) : overrides.signature };
}

export function rule(partial: Partial<JevRule> & { check: JevRule['check'] }): JevRule {
  return { id: 'acme.rule', description: 'A test rule', severity: 'block', message: 'Fix this answer.', audience: 'member', ...partial };
}

export function codes(result: JevResult, audience?: 'member' | 'staff'): string[] {
  return result.issues.filter((i) => !audience || i.audience === audience).map((i) => i.code);
}

export function find(result: JevResult, code: string, audience: 'member' | 'staff' = 'member'): JevIssue | undefined {
  return result.issues.find((i) => i.code === code && i.audience === audience);
}
