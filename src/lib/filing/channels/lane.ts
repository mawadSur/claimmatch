/**
 * Lane selection (chooseLane) and the member's view of it (toLaneView).
 * Pure. Order and rules: docs/designs/one-click-filing.md, section 8. Any
 * doubt is self_file: chooseLane never throws.
 */
import {
  MEMBER_LANE_REASON_OF,
  type LaneReasonCode,
  type LaneView,
  type MemberLaneReason,
} from '../v2/contract';
import { ChannelConfigSchema, type ChannelConfig, type FilingSpecContent } from '../v2/contract-spec';
import { addBusinessDaysCapped, endOfDay, lastDayForAgent, specTimeZone, withinCutoff } from './dates';
import type { LaneDecision, LaneInput } from './index';
import { channelSupports } from './support';

function selfFile(policyId: string | null, reasons: LaneReasonCode[]): LaneDecision {
  return { lane: 'self_file', agent: false, channel: null, policyId, reasons, lastDayForAgent: null, dueBy: null };
}

function stateCovered(allowed: readonly string[] | null, state: string | null): boolean {
  // agent_filing 'allowed' requires a list (FilingPolicyContentSchema): no list here is doubt.
  if (!allowed || !state) return false;
  return allowed.includes(state.trim().toUpperCase());
}

function dueByFor(input: LaneInput, config: ChannelConfig, zone: string, lastDay: string | null): string | null {
  if (config.type === 'filing_desk') {
    return addBusinessDaysCapped(input.now, config.sla_business_days, zone, lastDay).toISOString();
  }
  return lastDay ? endOfDay(lastDay, zone).toISOString() : null;
}

function decide(input: LaneInput): LaneDecision {
  const { policy, spec } = input;
  const policyId = policy.settlement_policy_id;
  const stop = (reason: LaneReasonCode) => selfFile(policyId, [reason]);

  if (!input.settlement.openForClaims) return stop('settlement_not_open');
  if (policy.kill_switch) return stop('kill_switch');
  if (policy.objection_received_at) return stop('objection_received');
  if (!policyId) return stop('no_settlement_policy');
  // The effective policy does not say which level prohibits; the console's summary tells them apart.
  if (policy.agent_filing === 'prohibited') return stop('agent_filing_prohibited');
  if (policy.agent_filing !== 'allowed') return stop('agent_filing_unknown');
  if (policy.identity_check_required) return stop('identity_check_unavailable');
  if (!spec || spec.status !== 'approved') return stop('no_approved_spec');
  const zone = specTimeZone(spec.content);
  if (!zone) return stop('no_approved_spec');
  if (spec.content.requires_agent_certification && !policy.agent_certification_allowed) {
    return stop('agent_certification_not_allowed');
  }
  if (!stateCovered(policy.allowed_states, input.member.state)) return stop('state_not_covered');
  if (input.healthConsent.required) {
    if (!policy.health_consent_text) return stop('health_consent_unavailable');
    if (input.healthConsent.given === false) return stop('health_consent_declined');
  }
  const channels = policy.channels.filter((c) => c && c.enabled === true);
  if (channels.length === 0) return stop('no_channel_enabled');

  const reasons: LaneReasonCode[] = [];
  for (const raw of channels) {
    const parsed = ChannelConfigSchema.safeParse(raw);
    if (!parsed.success) {
      reasons.push('channel_config_invalid');
      continue;
    }
    const config = parsed.data;
    const lastDay = lastDayForAgent(input.settlement.deadline, config.min_days_before_deadline);
    if (!withinCutoff(lastDay, zone, input.now)) {
      reasons.push('deadline_too_close');
      continue;
    }
    const support = channelSupports(config.type, { config, spec: spec.content, needsDocuments: input.needsDocuments });
    if (!support.ok) {
      reasons.push(support.reason);
      continue;
    }
    if (config.type === 'administrator_email' && !input.email.configured) {
      reasons.push('email_not_configured');
      continue;
    }
    if (config.type === 'filing_desk' && (!input.desk || input.desk.openJobs >= config.daily_capacity * config.sla_business_days)) {
      reasons.push('desk_at_capacity');
      continue;
    }
    return {
      lane: config.type,
      agent: true,
      channel: config,
      policyId,
      reasons,
      lastDayForAgent: lastDay,
      dueBy: dueByFor(input, config, zone, lastDay),
    };
  }
  return selfFile(policyId, reasons);
}

export function chooseLaneImpl(input: LaneInput): LaneDecision {
  try {
    return decide(input);
  } catch (err) {
    console.error('[filing/lane] chooseLane failed; self_file', { name: (err as Error)?.name });
    return selfFile(input?.policy?.settlement_policy_id ?? null, ['channel_config_invalid']);
  }
}

/**
 * The member's view. Reasons explain why Lawsuit AI cannot take the claim, so
 * they are shown on self_file only: on an agent lane, a channel passed over
 * for another one is not something the member can act on.
 */
export function toLaneViewImpl(decision: LaneDecision, deadline: string | null): LaneView {
  const reasons: MemberLaneReason[] = [];
  if (!decision.agent) {
    for (const code of decision.reasons) {
      const reason = MEMBER_LANE_REASON_OF[code] ?? 'not_offered_for_settlement';
      if (!reasons.includes(reason)) reasons.push(reason);
    }
    if (reasons.length === 0) reasons.push('not_offered_for_settlement');
  }
  return {
    lane: decision.lane,
    agent: decision.agent,
    reasons,
    last_day_for_agent: decision.agent ? decision.lastDayForAgent : null,
    deadline,
  };
}

/** The benefit tier's proof requirements, or every tier's when none is chosen yet. */
function proofsFor(spec: FilingSpecContent, tier: string | null) {
  const tiers = tier ? spec.benefit_tiers.filter((t) => t.key === tier) : spec.benefit_tiers;
  return tiers.flatMap((t) => t.proof);
}

/** The member's tier needs proof documents (or the packet already carries some). */
export function needsDocumentsFor(spec: FilingSpecContent, tier: string | null, documentCount = 0): boolean {
  if (documentCount > 0) return true;
  if (tier) return proofsFor(spec, tier).some((p) => p.required && p.min_files > 0);
  // Without a tier yet, a single-tier spec decides; several tiers wait for the choice.
  return spec.benefit_tiers.length === 1 && proofsFor(spec, null).some((p) => p.required && p.min_files > 0);
}

/** Health consent is needed: the policy says so, or the tier asks a health-flagged question or proof. */
export function healthConsentRequiredFor(
  spec: FilingSpecContent | null,
  tier: string | null,
  healthSensitive: boolean,
): boolean {
  if (healthSensitive) return true;
  if (!spec) return false;
  const askedQuestions = spec.questions.filter((q) => !q.tiers || (tier !== null && q.tiers.includes(tier)));
  return askedQuestions.some((q) => q.health_flag) || proofsFor(spec, tier).some((p) => p.health_flag);
}
