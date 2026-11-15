/**
 * Lane selection and channel adapters. The signatures and comments are the
 * CONTRACT (implemented by B3). Pure functions except getChannelAdapter's
 * adapters themselves, whose submit() loads its I/O module only when called.
 * Order and rules: docs/designs/one-click-filing.md, section 8.
 */
import type { Lane, LaneReasonCode, LaneView } from '../v2/contract';
import type {
  AgentChannel,
  ChannelConfig,
  EffectiveFilingPolicy,
  FilingControlsRecord,
  FilingPolicyRecord,
  FilingSpecContent,
  SpecStatus,
} from '../v2/contract-spec';
import { chooseLaneImpl, toLaneViewImpl } from './lane';
import { resolvePolicyLevels } from './policy';
import { apiSupports, bulkSupports, deskSupports, emailSupports } from './support';
import type { ChannelAdapter } from './types';

export { effectiveDeadline, lastDayForAgent, specTimeZone, daysUntilDate, DEFAULT_DEADLINE_TIME_ZONE } from './dates';
export { healthConsentRequiredFor, needsDocumentsFor } from './lane';
export { controlsRecordFromRow, policyRecordFromRow } from './policy';

export interface ResolvePolicyInput {
  /** The approved settlement-level version, or null (the default: self_file). */
  settlementPolicy: FilingPolicyRecord | null;
  /** The approved version for the settlement's administrator, or null. */
  administratorPolicy: FilingPolicyRecord | null;
  settlementControls: FilingControlsRecord | null;
  administratorControls: FilingControlsRecord | null;
  /** lawsuits.third_party_fee_status (0023). */
  thirdPartyFeeStatus: 'unknown' | 'allowed' | 'barred';
}

/**
 * The policy in force. The administrator level can only restrict:
 * prohibited there means prohibited; its kill switch, objection,
 * identity_check_required and health_sensitive apply; allowed_states
 * intersect. Channels and their config come only from the settlement version,
 * enabled ones in its order. No approved settlement version gives
 * DEFAULT_EFFECTIVE_POLICY plus the controls.
 */
export function resolveEffectivePolicy(input: ResolvePolicyInput): EffectiveFilingPolicy {
  return resolvePolicyLevels(input);
}

export interface LaneInput {
  now: Date;
  policy: EffectiveFilingPolicy;
  /**
   * deadline: the effective one, the earlier of lawsuits.deadline and the spec's
   * deadline.date. Days are counted in the spec's deadline.time_zone
   * (America/New_York without one). No deadline at all: no cutoff, and
   * global.settlement_open still stops a claim once the settlement closes.
   */
  settlement: { openForClaims: boolean; deadline: string | null };
  /** The settlement's current spec version; agent lanes need status approved. */
  spec: { id: string; version: number; status: SpecStatus; content: FilingSpecContent } | null;
  member: { state: string | null };
  /** The member's tier needs proof documents. */
  needsDocuments: boolean;
  /**
   * required: policy.health_sensitive, or the member's tier asks a health_flag
   * question or proof; given: the member's answer (null: not asked yet).
   */
  healthConsent: { required: boolean; given: boolean | null };
  /** Open filing_desk jobs now; null when unknown, which counts as no capacity. */
  desk: { openJobs: number } | null;
  /** Resend can send (RESEND_API_KEY and a verified sender). */
  email: { configured: boolean };
}

export interface LaneDecision {
  lane: Lane;
  agent: boolean;
  /** The chosen channel's config; null on self_file. */
  channel: ChannelConfig | null;
  /** EffectiveFilingPolicy.settlement_policy_id, stored on the job. */
  policyId: string | null;
  /** Every reason an agent lane or a channel was passed over, in check order. */
  reasons: LaneReasonCode[];
  /** Effective deadline minus the channel's min_days_before_deadline, calendar days; null on self_file or without a deadline. */
  lastDayForAgent: string | null;
  /** For a new job: now plus the desk SLA in business days, never after the end of lastDayForAgent (deadline zone); null on self_file. */
  dueBy: string | null;
}

/**
 * The first enabled channel that can take this claim, else self_file. Never
 * throws; any doubt is self_file. Settlement-wide checks first (open, kill
 * switch, objection, policy, identity, spec, certification, state, health),
 * then each channel in the policy's order (deadline cutoff, config, documents,
 * known challenges for the desk, desk capacity, email configured).
 */
export function chooseLane(input: LaneInput): LaneDecision {
  return chooseLaneImpl(input);
}

/**
 * The member's view of a decision: reasons mapped through MEMBER_LANE_REASON_OF, deduplicated.
 * Shown on self_file only (a channel passed over for another one is nothing the member can act on).
 */
export function toLaneView(decision: LaneDecision, deadline: string | null): LaneView {
  return toLaneViewImpl(decision, deadline);
}

const ADAPTERS: { [C in AgentChannel]: ChannelAdapter<C> } = {
  filing_desk: { channel: 'filing_desk', mode: 'staff', supports: deskSupports },
  administrator_bulk: { channel: 'administrator_bulk', mode: 'staff', supports: bulkSupports },
  administrator_email: {
    channel: 'administrator_email',
    mode: 'worker',
    supports: emailSupports,
    submit: async (input) => (await import('./administrator-email')).submitAdministratorEmail(input),
  },
  administrator_api: {
    channel: 'administrator_api',
    mode: 'worker',
    supports: apiSupports,
    submit: async (input) => (await import('./administrator-api')).submitAdministratorApi(input),
  },
};

/** The adapter for a channel. administrator_api wraps src/lib/administrators/adapters.ts; unsupported means needs_attention. */
export function getChannelAdapter<C extends AgentChannel>(channel: C): ChannelAdapter<C> {
  const adapter = ADAPTERS[channel];
  if (!adapter) throw new Error(`unknown filing channel: ${String(channel)}`);
  return adapter;
}
