/**
 * Jev global rules about the settlement, the lane and the signature
 * (docs/designs/one-click-filing.md, section 7). Member issues never name a
 * kill switch, an objection, a policy value or staffing: the member sees a
 * member-safe code (MEMBER_LANE_REASONS) and the real cause goes into a
 * staff-audience issue next to it.
 */
import { normalizeTypedName } from '../filing/v2/contract-base';
import type { LaneReasonCode } from '../filing/v2/contract';
import { makeIssue, type JevContext } from './context';
import { businessDaysThrough } from './dates';
import { MEMBER, STAFF } from './messages';
import type { JevGlobalRuleId, JevMode } from './types';

export interface GlobalRule {
  id: JevGlobalRuleId;
  modes: readonly JevMode[];
  run: (ctx: JevContext, id: JevGlobalRuleId) => void;
}

export const ALL_MODES: readonly JevMode[] = ['partial', 'pre_sign', 'pre_send'];
export const SIGNING_MODES: readonly JevMode[] = ['pre_sign', 'pre_send'];
const SENDING_MODES: readonly JevMode[] = ['pre_send'];

/** Channel cutoffs when a config omits min_days_before_deadline (the contract's defaults). */
const DEFAULT_MIN_DAYS: Record<string, number> = {
  filing_desk: 5,
  administrator_email: 5,
  administrator_bulk: 7,
  administrator_api: 3,
};
/** Business days a bulk export needs (staff upload it, then record results). */
const BULK_BUSINESS_DAYS = 2;

const settlementOpen: GlobalRule = {
  id: 'global.settlement_open',
  modes: ALL_MODES,
  run(ctx, id) {
    const severity = ctx.partial ? 'warn' : 'block';
    if (ctx.input.settlement?.openForClaims !== true) {
      ctx.add(makeIssue(id, severity, 'settlement_closed', null, MEMBER.settlementClosed));
    } else if (ctx.dates.daysToDeadline !== null && ctx.dates.daysToDeadline < 0) {
      ctx.add(makeIssue(id, severity, 'deadline_passed', null, MEMBER.deadlinePassed));
    }
  },
};

const laneAllowed: GlobalRule = {
  id: 'global.lane_allowed',
  modes: SIGNING_MODES,
  run(ctx, id) {
    if (!ctx.agent) return;
    const policy = ctx.input.policy;
    const causes: Array<[LaneReasonCode, string]> = [];
    if (policy.kill_switch) causes.push(['kill_switch', STAFF.killSwitch(policy.kill_switch_scope)]);
    if (policy.objection_received_at) causes.push(['objection_received', STAFF.objection(policy.objection_received_at)]);
    if (policy.agent_filing !== 'allowed') {
      const code = policy.agent_filing === 'prohibited' ? 'agent_filing_prohibited' : 'agent_filing_unknown';
      causes.push([code, STAFF.agentFiling(String(policy.agent_filing))]);
    }
    if (policy.identity_check_required) causes.push(['identity_check_unavailable', STAFF.identityCheck]);
    if (ctx.content?.requires_agent_certification && !policy.agent_certification_allowed) {
      causes.push(['agent_certification_not_allowed', STAFF.certification]);
    }
    const health = ctx.input.healthConsent;
    if (health?.required && !health.textAvailable) causes.push(['health_consent_unavailable', STAFF.healthTextMissing]);
    if (!ctx.channel || ctx.channel.enabled !== true) causes.push(['no_channel_enabled', STAFF.channelOff(String(ctx.lane))]);
    if (causes.length === 0) return;
    ctx.add(makeIssue(id, 'block', 'not_offered_for_settlement', null, MEMBER.notOffered));
    for (const [code, message] of causes) ctx.add(makeIssue(id, 'block', code, null, message, 'staff'));
  },
};

const specApproved: GlobalRule = {
  id: 'global.spec_approved',
  modes: SIGNING_MODES,
  run(ctx, id) {
    const spec = ctx.spec;
    if (!spec) {
      ctx.add(makeIssue(id, 'block', 'no_approved_spec', null, MEMBER.noSpec));
      return;
    }
    const accepted = ctx.mode === 'pre_send' ? ['approved', 'superseded'] : ['approved'];
    if (!accepted.includes(spec.status)) {
      const reviewAgain = ctx.mode === 'pre_sign' && spec.status === 'superseded';
      ctx.add(makeIssue(id, 'block', 'spec_not_approved', null, reviewAgain ? MEMBER.specNotApproved : MEMBER.specRetired));
      ctx.add(makeIssue(id, 'block', 'spec_not_approved', null, STAFF.specStatus(spec.status, ctx.mode), 'staff'));
    }
    const built = ctx.packet.spec;
    if (!built || built.id !== spec.id || built.version !== spec.version) {
      ctx.add(makeIssue(id, 'block', 'spec_changed', null, MEMBER.specChanged));
      ctx.add(makeIssue(id, 'block', 'spec_changed', null, STAFF.specMismatch, 'staff'));
    } else if (ctx.packet.attestation_sha256 !== spec.attestation_sha256) {
      ctx.add(makeIssue(id, 'block', 'statement_text_changed', null, MEMBER.statementTextChanged));
      ctx.add(makeIssue(id, 'block', 'statement_text_changed', null, STAFF.attestationHash, 'staff'));
    }
  },
};

/**
 * The cutoff counts calendar days, as chooseLane does (last_day_for_agent =
 * deadline minus min_days_before_deadline), so Jev and the lane never
 * disagree. Staff channels also get a business-day heads-up when the
 * remaining Monday-to-Friday days are fewer than the work needs.
 */
const deadlineCutoff: GlobalRule = {
  id: 'global.deadline_cutoff',
  modes: SIGNING_MODES,
  run(ctx, id) {
    const channel = ctx.channel;
    const days = ctx.dates.daysToDeadline;
    if (!ctx.agent || !channel || days === null || days < 0) return;
    const min = channel.min_days_before_deadline ?? DEFAULT_MIN_DAYS[channel.type] ?? 5;
    if (days < min) {
      ctx.add(makeIssue(id, 'block', 'deadline_too_close', null, MEMBER.deadlineTooClose));
      ctx.add(makeIssue(id, 'block', 'deadline_too_close', null, STAFF.cutoff(days, min, channel.type), 'staff'));
      return;
    }
    if (channel.type !== 'filing_desk' && channel.type !== 'administrator_bulk') return;
    const { today, deadline } = ctx.dates;
    if (!today || !deadline) return;
    const needed = channel.type === 'filing_desk' ? (channel.sla_business_days ?? 2) : BULK_BUSINESS_DAYS;
    const left = businessDaysThrough(today, deadline);
    if (left < needed) {
      const type = ctx.content?.deadline?.type ?? 'unspecified';
      ctx.add(makeIssue(id, 'warn', 'deadline_business_days_tight', null, STAFF.businessDays(left, needed, type, deadline, ctx.zone), 'staff'));
    }
  },
};

const allowedStates: GlobalRule = {
  id: 'global.allowed_states',
  modes: SIGNING_MODES,
  run(ctx, id) {
    const allowed = ctx.input.policy.allowed_states;
    const state = ctx.packet.member?.address?.state;
    if (!ctx.agent || !allowed || !state) return;
    if (!allowed.includes(state)) {
      ctx.add(makeIssue(id, 'block', 'state_not_covered', 'member.address.state', MEMBER.stateNotCovered));
      ctx.add(makeIssue(id, 'block', 'state_not_covered', 'member.address.state', STAFF.stateNotCovered(state, allowed), 'staff'));
    }
  },
};

const classDefinitionConfirmed: GlobalRule = {
  id: 'global.class_definition_confirmed',
  modes: SIGNING_MODES,
  run(ctx, id) {
    if (ctx.packet.confirmations?.class_definition !== true) {
      ctx.add(makeIssue(id, 'block', 'class_definition_not_confirmed', null, MEMBER.classDefinitionNotConfirmed));
    } else if (ctx.spec && ctx.packet.class_definition_sha256 !== ctx.spec.class_definition_sha256) {
      ctx.add(makeIssue(id, 'block', 'class_definition_changed', null, MEMBER.classDefinitionChanged));
      ctx.add(makeIssue(id, 'block', 'class_definition_changed', null, STAFF.classHash, 'staff'));
    }
  },
};

const signatureBinding: GlobalRule = {
  id: 'global.signature_binding',
  modes: SENDING_MODES,
  run(ctx, id) {
    const signature = ctx.input.signature;
    if (!signature) {
      ctx.add(makeIssue(id, 'block', 'signature_missing', null, MEMBER.signatureMissing));
      return;
    }
    if (signature.voided) {
      ctx.add(makeIssue(id, 'block', 'signature_voided', null, MEMBER.signatureVoided));
      return;
    }
    if (!ctx.input.packetHash) {
      ctx.add(makeIssue(id, 'block', 'packet_hash_missing', null, MEMBER.signatureChanged));
      ctx.add(makeIssue(id, 'block', 'packet_hash_missing', null, STAFF.packetHashMissing, 'staff'));
    } else if (signature.packet_hash !== ctx.input.packetHash) {
      ctx.add(makeIssue(id, 'block', 'signature_hash_mismatch', null, MEMBER.signatureChanged));
      ctx.add(makeIssue(id, 'block', 'signature_hash_mismatch', null, STAFF.signatureHash, 'staff'));
    }
    if (signature.lane !== ctx.lane) {
      ctx.add(makeIssue(id, 'block', 'signature_lane_mismatch', null, MEMBER.signatureChanged));
      ctx.add(makeIssue(id, 'block', 'signature_lane_mismatch', null, STAFF.signatureLane(signature.lane, String(ctx.lane)), 'staff'));
    }
    const legal = ctx.packet.member?.legal_name ?? '';
    if (!legal || normalizeTypedName(signature.typed_name ?? '') !== normalizeTypedName(legal)) {
      ctx.add(makeIssue(id, 'block', 'typed_name_mismatch', null, MEMBER.typedNameMismatch));
    }
  },
};

const statementUnchanged: GlobalRule = {
  id: 'global.statement_unchanged',
  modes: SENDING_MODES,
  run(ctx, id) {
    const signature = ctx.input.signature;
    if (!signature || !ctx.spec) return;
    if (signature.statement_sha256 !== ctx.spec.attestation_sha256) {
      ctx.add(makeIssue(id, 'block', 'statement_changed', null, MEMBER.statementChanged));
      ctx.add(makeIssue(id, 'block', 'statement_changed', null, STAFF.statementHash, 'staff'));
    }
  },
};

const duplicateIdentity: GlobalRule = {
  id: 'global.duplicate_identity',
  modes: SENDING_MODES,
  run(ctx, id) {
    const n = ctx.input.duplicates?.sameIdentityOtherAccounts ?? 0;
    if (n > 0) ctx.add(makeIssue(id, 'warn', 'duplicate_identity', null, STAFF.duplicates(n), 'staff'));
  },
};

export const SETTLEMENT_LEVEL_RULES: readonly GlobalRule[] = [
  settlementOpen,
  laneAllowed,
  specApproved,
  deadlineCutoff,
  allowedStates,
  classDefinitionConfirmed,
  signatureBinding,
  statementUnchanged,
  duplicateIdentity,
];
