/**
 * The lane one member's claim gets today, as the member API shows it, and
 * the Jev input for the same facts. chooseLane and toLaneView (B3) decide;
 * this adds the member-side rules: "Lawsuit AI files this claim for you"
 * only on strong matches (design section 5), and any doubt (a throw, an
 * unreadable policy) is self_file. Pure.
 */
import type { JevInput, JevMode } from '../../jev/types';
import { chooseLane, toLaneView, type LaneDecision } from '../channels/index';
import {
  MEMBER_LANE_REASON_OF,
  type Lane,
  type LaneView,
  type MemberLaneReason,
  type PacketDraft,
} from './contract';
import type { FilingSpecContent } from './contract-spec';
import {
  daysToDeadline,
  deadlineZone,
  effectiveDeadline,
  openForClaimsNow,
  type LaneEnv,
  type SettlementEnv,
} from './environment';
import { logFilingError } from './http';
import { sha256Hex } from './packet';
import { asksHealthData, tierProofs } from './packet-items';
import type { SpecRecord } from './records';

export interface HealthFacts {
  /** policy.health_sensitive, or the member's tier asks a health-flagged item. */
  required: boolean;
  textAvailable: boolean;
  /** true: consented to the current text; false: declined it; null: not asked yet. */
  given: boolean | null;
}

export interface LaneResult {
  decision: LaneDecision;
  view: LaneView;
  health: HealthFacts;
  deadline: string | null;
  daysToDeadline: number | null;
  openForClaims: boolean;
}

/** Health consent facts for a packet: consent counts only for the policy's current text. */
export function healthFacts(args: {
  env: SettlementEnv;
  spec: FilingSpecContent | null;
  draft: PacketDraft | null;
  consent: { at: string | null; textSha256: string | null } | null;
}): HealthFacts {
  const text = args.env.policy.health_consent_text;
  const required = args.env.policy.health_sensitive || (args.draft ? asksHealthData(args.spec, args.draft) : false);
  let given: boolean | null = null;
  if (text && args.consent?.textSha256 === sha256Hex(text)) given = args.consent.at ? true : false;
  return { required, textAvailable: Boolean(text), given };
}

function selfFile(decision: Partial<LaneDecision>, reasons: MemberLaneReason[], deadline: string | null) {
  const out: LaneDecision = {
    lane: 'self_file',
    agent: false,
    channel: null,
    policyId: decision.policyId ?? null,
    reasons: decision.reasons ?? [],
    lastDayForAgent: null,
    dueBy: null,
  };
  const view: LaneView = { lane: 'self_file', agent: false, reasons, last_day_for_agent: null, deadline };
  return { decision: out, view };
}

function viewOf(decision: LaneDecision, deadline: string | null): LaneView {
  try {
    return toLaneView(decision, deadline);
  } catch {
    const reasons = [...new Set(decision.reasons.map((r) => MEMBER_LANE_REASON_OF[r]))];
    return {
      lane: decision.lane,
      agent: decision.agent,
      reasons,
      last_day_for_agent: decision.agent ? decision.lastDayForAgent : null,
      deadline,
    };
  }
}

/**
 * The lane for these facts. `spec` is the settlement's approved spec (chooseLane
 * needs approved); the deadline and its zone come from it when present.
 */
export function computeLane(args: {
  env: SettlementEnv;
  laneEnv: LaneEnv;
  draft: PacketDraft | null;
  memberState: string | null;
  health: HealthFacts;
  now: Date;
}): LaneResult {
  const { env, now } = args;
  const spec: SpecRecord | null = env.approvedSpec;
  const content = spec?.content ?? null;
  const deadline = effectiveDeadline(env.settlement.deadline, content);
  const days = daysToDeadline(deadline, deadlineZone(content), now);
  const openForClaims = openForClaimsNow(env, content, now);
  const base = { health: args.health, deadline, daysToDeadline: days, openForClaims };
  const draft = args.draft;
  const needsDocuments = draft
    ? draft.documents.length > 0 || tierProofs(content, draft.benefit_tier).some((p) => p.required)
    : false;
  let decision: LaneDecision;
  try {
    decision = chooseLane({
      now,
      policy: env.policy,
      settlement: { openForClaims, deadline },
      spec: spec ? { id: spec.id, version: spec.version, status: spec.status, content: spec.content } : null,
      member: { state: args.memberState },
      needsDocuments,
      healthConsent: { required: args.health.required, given: args.health.given },
      desk: args.laneEnv.deskOpenJobs === null ? null : { openJobs: args.laneEnv.deskOpenJobs },
      email: { configured: args.laneEnv.emailConfigured },
    });
  } catch (error) {
    logFilingError('chooseLane failed', { code: error instanceof Error ? error.name : null });
    return { ...base, ...selfFile({ policyId: env.policy.settlement_policy_id }, ['not_offered_for_settlement'], deadline) };
  }
  if (decision.agent && !env.strongMatch) {
    return { ...base, ...selfFile(decision, ['not_offered_for_settlement'], deadline) };
  }
  return { ...base, decision, view: viewOf(decision, deadline) };
}

/** The member view of a claim that already has a live signature: the lane it was signed for. */
export function signedLaneView(lane: Lane, result: LaneResult): LaneView {
  return {
    lane,
    agent: lane !== 'self_file',
    reasons: [],
    last_day_for_agent: result.decision.lane === lane ? result.decision.lastDayForAgent : null,
    deadline: result.deadline,
  };
}

/** A self_file view with no reasons (closed packets, finished or legacy claims). */
export function plainSelfFileView(deadline: string | null): LaneView {
  return { lane: 'self_file', agent: false, reasons: [], last_day_for_agent: null, deadline };
}

export function buildJevInput(args: {
  mode: JevMode;
  now: Date;
  lane: Lane;
  draft: PacketDraft;
  packetHash: string | null;
  spec: SpecRecord | null;
  env: SettlementEnv;
  lane_result: LaneResult;
}): JevInput {
  const { spec } = args;
  return {
    mode: args.mode,
    now: args.now.toISOString(),
    lane: args.lane,
    packet: args.draft,
    packetHash: args.packetHash,
    spec: spec
      ? {
          id: spec.id,
          version: spec.version,
          status: spec.status,
          content: spec.content,
          attestation_sha256: spec.attestation_sha256,
          class_definition_sha256: spec.class_definition_sha256,
        }
      : null,
    policy: args.env.policy,
    settlement: {
      openForClaims: args.lane_result.openForClaims,
      deadline: args.lane_result.deadline,
      daysToDeadline: args.lane_result.daysToDeadline,
    },
    healthConsent: {
      required: args.lane_result.health.required,
      textAvailable: args.lane_result.health.textAvailable,
      given: args.lane_result.health.given === true,
    },
    signature: null,
    duplicates: null,
  };
}
