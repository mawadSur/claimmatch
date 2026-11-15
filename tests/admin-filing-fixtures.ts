/**
 * Fixtures for tests/admin-filing-*.test.ts(x). Every object is parsed with
 * the staff API contract's own schema, so a fixture that drifts from the
 * contract fails loudly. Not a test file (vitest only runs *.test.*).
 */
import {
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
} from '@/lib/filing/v2/contract';
import {
  ControlsViewSchema,
  DeskPacketViewSchema,
  JobSummarySchema,
  PolicyRecordViewSchema,
  SettlementFilingDetailResponseSchema,
  SettlementFilingSummarySchema,
  SpecRecordViewSchema,
  type DeskPacketView,
} from '@/lib/filing/v2/contract-staff';
import type {
  ControlsView,
  FilingPermissions,
  JobSummary,
  PolicyRecord,
  SettlementDetail,
  SettlementSummary,
  SpecRecord,
} from '@/components/admin/filing/types';

export const NOW_ISO = '2026-11-12T15:00:00.000Z';
export const NOW = new Date(NOW_ISO);
export const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000a1';
export const ADMINISTRATOR_ID = '00000000-0000-4000-8000-0000000000b1';
export const REVIEWER_ID = '00000000-0000-4000-8000-0000000000c1';
export const AGENT_ID = '00000000-0000-4000-8000-0000000000c2';
export const CLAIM_ID = '00000000-0000-4000-8000-0000000000d1';
export const JOB_ID = '00000000-0000-4000-8000-0000000000e1';
export const SIGNATURE_ID = '00000000-0000-4000-8000-0000000000f1';
export const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000f2';
export const HASH = 'a'.repeat(64);
export const OFFICIAL_URL = 'https://claims.example-settlement.test/form';

export const ATTESTATION = 'I declare under penalty of perjury that the information above is true and correct.';
export const CLASS_DEFINITION = 'All persons in the United States who bought Product X between 2019 and 2023.';

export const SPEC_CONTENT = FilingSpecContentSchema.parse({
  official_form: { url: OFFICIAL_URL, title: 'Claim Form', challenges: [] },
  class_definition: { text: CLASS_DEFINITION, source_url: 'https://claims.example-settlement.test/notice' },
  attestation: { text: ATTESTATION, source_url: null },
  deadline: { date: '2026-12-15', type: 'submit_online_by' },
  member_fields: [
    { field: 'legal_name', official_label: 'Full Name', required: true },
    { field: 'email', official_label: 'Email Address', required: true },
    { field: 'address.line1', official_label: 'Street Address', required: true },
    { field: 'address.city', official_label: 'City', required: true },
    { field: 'address.state', official_label: 'State', required: true },
    { field: 'address.zip', official_label: 'ZIP Code', required: true },
  ],
  questions: [{ key: 'item_count', official_label: 'How many units did you buy?', type: 'integer', required: true }],
  benefit_tiers: [
    {
      key: 'with_proof',
      official_label: 'Claim with proof of purchase',
      proof: [{ kind: 'receipt', official_label: 'Receipt', required: true }],
    },
  ],
  payout_options: [{ value: 'check', official_label: 'Paper check' }],
  form_field_order: ['member.legal_name', 'member.email', 'answers.item_count', 'benefit_tier', 'documents.receipt', 'payout_method'],
});

export const POLICY_CONTENT = FilingPolicyContentSchema.parse({
  agent_filing: 'allowed',
  allowed_states: ['CA', 'NY'],
  channels: [{ type: 'filing_desk', enabled: true }],
  sources_reviewed: [
    { kind: 'settlement_agreement', title: 'Settlement agreement', url: 'https://claims.example-settlement.test/agreement', reviewed_on: '2026-11-01' },
  ],
});

export function policyRecord(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return PolicyRecordViewSchema.parse({
    id: '00000000-0000-4000-8000-000000000101',
    target: { lawsuit_id: LAWSUIT_ID },
    version: 2,
    status: 'draft',
    content: POLICY_CONTENT,
    created_by: AGENT_ID,
    created_at: '2026-11-10T12:00:00.000Z',
    updated_by: AGENT_ID,
    updated_at: '2026-11-11T12:00:00.000Z',
    approved_by: null,
    approved_at: null,
    approval_notes: null,
    documents_reviewed: null,
    rejected_by: null,
    rejected_at: null,
    rejection_notes: null,
    ...overrides,
  });
}

export function approvedPolicy(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return policyRecord({
    id: '00000000-0000-4000-8000-000000000100',
    version: 1,
    status: 'approved',
    approved_by: REVIEWER_ID,
    approved_at: '2026-11-05T16:30:00.000Z',
    approval_notes: 'Agreement section 4.2 permits authorized representatives with written authority.',
    documents_reviewed: POLICY_CONTENT.sources_reviewed,
    ...overrides,
  });
}

export function specRecord(overrides: Partial<SpecRecord> = {}): SpecRecord {
  return SpecRecordViewSchema.parse({
    id: '00000000-0000-4000-8000-000000000201',
    lawsuit_id: LAWSUIT_ID,
    version: 2,
    status: 'draft',
    content: SPEC_CONTENT,
    created_by: AGENT_ID,
    created_at: '2026-11-10T12:00:00.000Z',
    updated_by: AGENT_ID,
    updated_at: '2026-11-11T12:00:00.000Z',
    approved_by: null,
    approved_at: null,
    approval_notes: null,
    documents_reviewed: null,
    retired_at: null,
    retire_reason: null,
    ...overrides,
  });
}

export function approvedSpec(overrides: Partial<SpecRecord> = {}): SpecRecord {
  return specRecord({
    id: '00000000-0000-4000-8000-000000000200',
    version: 1,
    status: 'approved',
    approved_by: REVIEWER_ID,
    approved_at: '2026-11-06T10:00:00.000Z',
    approval_notes: 'Checked against the claim form.',
    documents_reviewed: [{ kind: 'claim_form', title: 'Claim Form', url: OFFICIAL_URL, document_ref: null, reviewed_on: '2026-11-06', notes: null }],
    ...overrides,
  });
}

export function summary(overrides: Partial<SettlementSummary> = {}): SettlementSummary {
  return SettlementFilingSummarySchema.parse({
    lawsuit_id: LAWSUIT_ID,
    slug: 'product-x-settlement',
    title: 'Product X settlement',
    deadline: '2026-12-15',
    administrator: { id: ADMINISTRATOR_ID, slug: 'example-admin', name: 'Example Administrator' },
    agent_filing: 'allowed',
    channels_enabled: ['filing_desk'],
    lane_preview: 'filing_desk',
    lane_reasons: [],
    kill_switch: false,
    objection: false,
    policy: { approved_version: 1, draft_version: 2 },
    spec: { approved_version: 1, draft_version: 2 },
    open_jobs: 3,
    ...overrides,
  });
}

export function controls(overrides: Partial<ControlsView> = {}): ControlsView {
  return ControlsViewSchema.parse({
    target: { lawsuit_id: LAWSUIT_ID },
    kill_switch: false,
    kill_switch_reason: null,
    kill_switch_changed_at: null,
    objection_received_at: null,
    objection_notes: null,
    ...overrides,
  });
}

export function detail(overrides: Partial<SettlementDetail> = {}): SettlementDetail {
  return SettlementFilingDetailResponseSchema.parse({
    summary: summary(),
    policies: [approvedPolicy(), policyRecord()],
    administrator_policies: [],
    specs: [approvedSpec(), specRecord()],
    controls: [controls()],
    ...overrides,
  });
}

let jobCounter = 0;

export function job(overrides: Partial<JobSummary> = {}): JobSummary {
  jobCounter += 1;
  return JobSummarySchema.parse({
    id: `00000000-0000-4000-8000-${String(jobCounter).padStart(12, '0')}`,
    claim_id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    settlement_title: 'Product X settlement',
    channel: 'filing_desk',
    status: 'queued',
    due_by: '2026-11-14T22:00:00.000Z',
    deadline: '2026-12-15',
    attempt: 0,
    locked: false,
    locked_by_me: false,
    needs_attention_reason: null,
    created_at: '2026-11-12T10:00:00.000Z',
    ...overrides,
  });
}

export function deskView(overrides: Partial<DeskPacketView> = {}): DeskPacketView {
  return DeskPacketViewSchema.parse({
    job: job({ id: JOB_ID, status: 'in_progress', locked: true, locked_by_me: true, attempt: 1 }),
    claim: { id: CLAIM_ID, status: 'filing' },
    settlement: { title: 'Product X settlement', official_form_url: OFFICIAL_URL, deadline: '2026-12-15' },
    signature: {
      id: SIGNATURE_ID,
      typed_name: 'Jordan Q. Member',
      signed_at: '2026-11-12T09:00:00.000Z',
      packet_hash: HASH,
      statement_text: ATTESTATION,
      lane: 'filing_desk',
    },
    fields: [
      { path: 'member.legal_name', label: 'Full Name', copy_text: 'Jordan Q. Member', required: true },
      { path: 'member.email', label: 'Email Address', copy_text: 'jordan@example.test', required: true },
      { path: 'answers.item_count', label: 'How many units did you buy?', copy_text: '3', required: true },
      { path: 'payout_method', label: 'Payout method', copy_text: 'Paper check', required: true },
    ],
    documents: [
      { id: DOCUMENT_ID, kind: 'receipt', label: 'Receipt', mime: 'image/jpeg', size_bytes: 204800, sha256: 'b'.repeat(64) },
    ],
    instructions: 'Use the long form, not the quick claim.',
    checks: { outcome: 'pass', issues: [] },
    lock: { mine: true, expires_at: '2026-11-12T15:30:00.000Z' },
    ...overrides,
  });
}

type Role = 'legal_reviewer' | 'filing_agent';

/** The flags the console derives from a user's roles (mirrors src/app/admin/filing/_lib/permissions.ts; tests compare both). */
export function expectedPermissions(roles: Role[], isAdmin: boolean): FilingPermissions {
  const reviewer = roles.includes('legal_reviewer');
  const agent = roles.includes('filing_agent');
  const inConsole = isAdmin || roles.length > 0;
  return {
    userId: isAdmin ? 'admin-user' : 'staff-user',
    isAdmin,
    roles: [...roles],
    canDraft: inConsole,
    canApprove: reviewer,
    canWorkDesk: agent,
    canViewMemberData: agent || reviewer,
    canResolveJobs: agent || reviewer,
    canManageRoles: isAdmin || reviewer,
    canKillSwitchOn: inConsole,
    canKillSwitchOff: reviewer,
    canRecordObjection: inConsole,
    canClearObjection: reviewer,
  };
}
