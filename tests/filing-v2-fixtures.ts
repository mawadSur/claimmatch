/**
 * Fixtures for the member filing API tests (B2): one published, open
 * settlement with an approved spec and an approved policy that enables the
 * filing desk, a member profile, and stand-ins for the other areas' entry
 * points (Jev's runJev, B3's chooseLane / resolveEffectivePolicy /
 * toLaneView / enqueueFiling / withdrawFiling), so these tests do not depend
 * on code that is still being built in parallel.
 */
import type { JevInput, JevIssue, JevResult } from '@/lib/jev/types';
import type { LaneDecision, LaneInput, ResolvePolicyInput } from '@/lib/filing/channels/index';
import type { EnqueueFilingInput, WithdrawFilingInput } from '@/lib/filing/v2/jobs';
import { MEMBER_LANE_REASON_OF, type LaneReasonCode, type LaneView } from '@/lib/filing/v2/contract';
import { DEFAULT_EFFECTIVE_POLICY, FilingSpecContentSchema, type EffectiveFilingPolicy } from '@/lib/filing/v2/contract-spec';
import type { FakeDb, Row } from './filing-v2-fake';

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
export const LAWSUIT = '00000000-0000-4000-8000-0000000000d1';
export const SPEC_ID = '00000000-0000-4000-8000-0000000000e1';
export const POLICY_ID = '00000000-0000-4000-8000-0000000000f1';
export const NOW = new Date('2026-11-14T15:00:00Z');
export const HEALTH_TEXT = 'I agree that Lawsuit AI may collect and share my health information for this claim only.';

export const SPEC_CONTENT = FilingSpecContentSchema.parse({
  official_form: { url: 'https://claims.example.test/form', title: 'Claim Form' },
  class_definition: { text: 'All persons in the United States who bought the product.', source_url: 'https://claims.example.test/notice' },
  attestation: { text: 'I declare under penalty of perjury that the information above is true and correct.' },
  member_fields: [
    { field: 'legal_name', official_label: 'Full Name', required: true },
    { field: 'email', official_label: 'Email Address', required: true },
    { field: 'address.line1', official_label: 'Street Address', required: true },
    { field: 'address.city', official_label: 'City', required: true },
    { field: 'address.state', official_label: 'State', required: true },
    { field: 'address.zip', official_label: 'ZIP Code', required: true },
  ],
  questions: [
    { key: 'purchase_count', official_label: 'How many did you buy?', type: 'integer', required: true, validation: { min: 1, max: 10 } },
    {
      key: 'store',
      official_label: 'Where did you buy it?',
      type: 'single_choice',
      required: false,
      options: [
        { value: 'online', official_label: 'Online' },
        { value: 'in_store', official_label: 'In a store' },
      ],
    },
    { key: 'side_effects', official_label: 'Did you have side effects?', type: 'yes_no', required: true, health_flag: true, tiers: ['injury'] },
  ],
  benefit_tiers: [
    { key: 'basic', official_label: 'Basic payment' },
    {
      key: 'documented',
      official_label: 'Documented payment',
      proof: [{ kind: 'receipt', official_label: 'Receipt', required: true, max_files: 2, accepted_mime: ['image/jpeg', 'image/png', 'application/pdf'] }],
    },
    { key: 'injury', official_label: 'Injury payment' },
  ],
  payout_options: [
    { value: 'check', official_label: 'Paper check' },
    { value: 'paypal', official_label: 'PayPal' },
  ],
  form_field_order: ['member.legal_name', 'member.email', 'answers.purchase_count', 'benefit_tier', 'documents.receipt', 'payout_method'],
});

export function settlementRow(overrides: Row = {}): Row {
  return {
    id: LAWSUIT,
    slug: 'test-product-settlement',
    title: 'Test product settlement',
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    deadline: '2026-12-31',
    claim_url: 'https://claims.example.test/form',
    source_url: 'https://news.example.test/settlement',
    eligibility_text: 'People who bought the product.',
    eligibility: { requires: ['bought_consumer_goods'] },
    proof_required: false,
    form_field_order: null,
    final_approval_hearing_at: null,
    payment_timing_text: null,
    administrator_id: null,
    third_party_fee_status: 'unknown',
    tags: {},
    ...overrides,
  };
}

export function policyRow(overrides: Row = {}): Row {
  return {
    id: POLICY_ID,
    lawsuit_id: LAWSUIT,
    administrator_id: null,
    version: 1,
    status: 'approved',
    agent_filing: 'allowed',
    channels: [{ type: 'filing_desk', enabled: true }],
    agent_certification_allowed: false,
    allowed_states: ['CA', 'NY'],
    health_sensitive: false,
    health_consent_text: HEALTH_TEXT,
    identity_check_required: false,
    sources_reviewed: [],
    notes: null,
    approved_by: '00000000-0000-4000-8000-0000000000aa',
    approved_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

export function profileRow(userId = USER_A, overrides: Row = {}): Row {
  return {
    id: userId,
    full_name: 'Ada Lovelace',
    email: 'ada@example.test',
    phone: '555-0100',
    address_line1: '1 Main St',
    address_line2: null,
    city: 'Springfield',
    state: 'CA',
    zip: '94110',
    prefill_consent_at: null,
    ...overrides,
  };
}

/** A published, open settlement with an approved spec and an agent-allowed policy; both members have profiles. */
export function seedSettlement(db: FakeDb, opts: { policy?: Row | null; settlement?: Row; spec?: boolean } = {}) {
  db.rows('lawsuits').push(settlementRow(opts.settlement));
  if (opts.spec !== false) {
    db.rows('filing_specs').push({ id: SPEC_ID, lawsuit_id: LAWSUIT, version: 1, status: 'approved', content: structuredClone(SPEC_CONTENT) });
  }
  if (opts.policy !== null) db.rows('filing_policies').push(policyRow(opts.policy ?? {}));
  db.rows('profiles').push(profileRow(USER_A), profileRow(USER_B, { full_name: 'Grace Hopper', email: 'grace@example.test' }));
}

/** The fresh-sign-in claims of a password sign-in `secondsAgo` before NOW. */
export function signInClaims(userId: string, secondsAgo = 60, method = 'password') {
  return { sub: userId, session_id: 'sess-1', amr: [{ method, timestamp: Math.floor(NOW.getTime() / 1000) - secondsAgo }] };
}

/* -------------------------------------------------------------------------- */
/* Stand-ins for B3 (channels, jobs) and B1 (Jev)                             */
/* -------------------------------------------------------------------------- */

export function fakeResolvePolicy(input: ResolvePolicyInput): EffectiveFilingPolicy {
  const p = input.settlementPolicy;
  const kill = Boolean(input.settlementControls?.kill_switch || input.administratorControls?.kill_switch);
  if (!p) return { ...DEFAULT_EFFECTIVE_POLICY, kill_switch: kill, third_party_fee_status: input.thirdPartyFeeStatus };
  return {
    settlement_policy_id: p.id,
    administrator_policy_id: null,
    agent_filing: p.agent_filing,
    channels: p.channels.filter((c) => c.enabled),
    agent_certification_allowed: p.agent_certification_allowed,
    allowed_states: p.allowed_states,
    health_sensitive: p.health_sensitive,
    health_consent_text: p.health_consent_text,
    identity_check_required: p.identity_check_required,
    third_party_fee_status: input.thirdPartyFeeStatus,
    kill_switch: kill,
    kill_switch_scope: kill ? 'settlement' : null,
    objection_received_at: null,
  };
}

export function fakeChooseLane(input: LaneInput): LaneDecision {
  const reasons: LaneReasonCode[] = [];
  const policy = input.policy;
  if (!input.settlement.openForClaims) reasons.push('settlement_not_open');
  else if (policy.kill_switch) reasons.push('kill_switch');
  else if (policy.agent_filing !== 'allowed') reasons.push(policy.agent_filing === 'unknown' ? 'agent_filing_unknown' : 'agent_filing_prohibited');
  else if (!input.spec || input.spec.status !== 'approved') reasons.push('no_approved_spec');
  else if (policy.allowed_states && !policy.allowed_states.includes(input.member.state ?? '')) reasons.push('state_not_covered');
  else if (input.healthConsent.required && input.healthConsent.given === false) reasons.push('health_consent_declined');
  const channel = reasons.length ? null : policy.channels[0] ?? null;
  if (!channel) {
    return {
      lane: 'self_file',
      agent: false,
      channel: null,
      policyId: policy.settlement_policy_id,
      reasons: reasons.length ? reasons : ['no_channel_enabled'],
      lastDayForAgent: null,
      dueBy: null,
    };
  }
  return { lane: channel.type, agent: true, channel, policyId: policy.settlement_policy_id, reasons: [], lastDayForAgent: '2026-12-26', dueBy: '2026-11-18T04:59:59.000Z' };
}

export function fakeToLaneView(decision: LaneDecision, deadline: string | null): LaneView {
  return {
    lane: decision.lane,
    agent: decision.agent,
    reasons: [...new Set(decision.reasons.map((r) => MEMBER_LANE_REASON_OF[r]))],
    last_day_for_agent: decision.agent ? decision.lastDayForAgent : null,
    deadline,
  };
}

export interface JevKnobs {
  /** Extra issues for a run (tests add blocks, warnings, staff issues). */
  extra?: (input: JevInput) => JevIssue[];
  runs: JevInput[];
}

/** Flags SSN-like answers as Jev's global.no_secrets does, plus whatever the test adds. */
export function fakeRunJev(knobs: JevKnobs, input: JevInput): JevResult {
  knobs.runs.push(input);
  const issues: JevIssue[] = [];
  for (const [key, value] of Object.entries(input.packet.answers)) {
    if (typeof value === 'string' && /^\d{3}-?\d{2}-?\d{4}$/.test(value)) {
      issues.push({ rule_id: 'global.no_secrets', source: 'global', severity: 'block', code: 'secret_like_value', message: 'This looks like a Social Security number.', field: `answers.${key}`, audience: 'member' });
    }
  }
  issues.push(...(knobs.extra?.(input) ?? []));
  const count = (s: string) => issues.filter((i) => i.severity === s).length;
  const outcome = count('block') ? 'block' : count('warn') ? 'warn' : 'pass';
  return {
    engine_version: 'jev-1',
    mode: input.mode,
    outcome,
    issues,
    counts: { block: count('block'), warn: count('warn'), info: count('info') },
    rule_set_hash: 'a'.repeat(64),
    packet_hash: input.packetHash,
    evaluated_at: input.now,
  };
}

export interface JobKnobs {
  db: FakeDb;
  enqueueFails: boolean;
  enqueued: EnqueueFilingInput[];
  withdrawn: WithdrawFilingInput[];
}

/** filing_enqueue, as enqueueFiling calls it: claim signed -> queued with one job. */
export async function fakeEnqueue(k: JobKnobs, input: EnqueueFilingInput) {
  k.enqueued.push(input);
  if (k.enqueueFails) return { ok: false as const, code: 'service_unavailable' as const, message: 'down' };
  const sig = k.db.find('claim_signatures', (s) => s.id === input.signatureId);
  const claim = sig && k.db.find('claims', (c) => c.id === sig.claim_id);
  if (!sig || !claim) return { ok: false as const, code: 'not_found' as const, message: '' };
  if (input.decision.lane !== sig.lane) return { ok: false as const, code: 'lane_unavailable' as const, message: '' };
  const existing = k.db.find('claim_filing_jobs', (j) => j.signature_id === sig.id);
  if (existing) return { ok: true as const, created: false, job: existing as never, claimStatus: String(claim.status) };
  if (claim.status !== 'signed') return { ok: false as const, code: 'invalid_transition' as const, message: '' };
  const job = k.db.insertRow('claim_filing_jobs', { claim_id: claim.id, signature_id: sig.id, channel: sig.lane, status: 'queued' });
  claim.status = 'queued';
  k.db.event(String(claim.id), 'signed', 'queued', input.actor, { action: 'queued', job_id: job.id, channel: sig.lane });
  return { ok: true as const, created: true, job: job as never, claimStatus: 'queued' };
}

/** filing_move_claim, as withdrawFiling calls it. */
export async function fakeWithdraw(k: JobKnobs, input: WithdrawFilingInput) {
  k.withdrawn.push(input);
  const fail = (code: 'not_found' | 'filing_in_progress') => ({ ok: false as const, code, message: '' });
  const claim = k.db.find('claims', (c) => c.id === input.claimId && c.user_id === input.userId);
  if (!claim) return fail('not_found');
  if (claim.status === input.to) return { ok: true as const, changed: false, claimStatus: input.to, jobCancelled: null, signatureVoided: null };
  if (claim.status === 'filing') return fail('filing_in_progress');
  const job = k.db.find('claim_filing_jobs', (j) => j.claim_id === claim.id && ['queued', 'in_progress', 'exported', 'needs_attention'].includes(String(j.status)));
  if (job && job.status !== 'queued') return fail('filing_in_progress');
  if (job) job.status = 'cancelled';
  const voided = new Set(k.db.rows('claim_signature_voids').map((v) => v.signature_id));
  const live = k.db.rows('claim_signatures').find((s) => s.claim_id === claim.id && !voided.has(s.id));
  if (live) k.db.insertRow('claim_signature_voids', { signature_id: live.id, claim_id: claim.id, user_id: claim.user_id, reason: input.reasonCode, actor: input.actor });
  const packet = k.db.find('claim_packets', (p) => p.claim_id === claim.id);
  if (packet && input.to === 'withdrawn') packet.status = 'closed';
  else if (packet?.status === 'signed') Object.assign(packet, { status: 'open', signature_id: null, signed_at: null, revision: Number(packet.revision) + 1 });
  const from = claim.status;
  claim.status = input.to;
  k.db.event(String(claim.id), from, input.to, input.actor, { action: 'moved', reason: input.reasonCode });
  return { ok: true as const, changed: true, claimStatus: input.to, jobCancelled: job ? String(job.id) : null, signatureVoided: live ? String(live.id) : null };
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export function jsonRequest(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

export const BEARER = 'Bearer app-header.app-payload.app-signature';

/** PNG and PDF file starts, enough for type sniffing. */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
export const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
