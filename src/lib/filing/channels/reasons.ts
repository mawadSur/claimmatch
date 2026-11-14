/**
 * Reason codes that reach member-readable rows (claim_events.detail and
 * claim_signature_voids.reason, both readable by the member under RLS). Only
 * this vocabulary goes there: a kill switch, an objection or an
 * administrator's refusal becomes not_offered_for_settlement, and a staff
 * member's own code stays in the job's result (staff only).
 * docs/designs/one-click-filing.md, section 4.
 */
import { MEMBER_LANE_REASON_OF, MEMBER_LANE_REASONS, type LaneReasonCode } from '../v2/contract';

export const MEMBER_SAFE_REASONS = [
  ...MEMBER_LANE_REASONS,
  // The member's own choices (WithdrawRequestSchema and the reopen/self-file routes).
  'changed_mind',
  'filed_myself',
  'not_eligible',
  'other',
  'member_edit',
  'member_choice',
  // Filing results and system moves.
  'not_submitted',
  'not_accepted',
  'more_information_needed',
  'proof_needed',
  'details_need_correction',
  'stopped_at_challenge',
  'lane_changed',
  'spec_updated',
  'signature_check_failed',
] as const;
export type MemberSafeReason = (typeof MEMBER_SAFE_REASONS)[number];

const CODE = /^[a-z][a-z0-9_]{0,63}$/;

export function isMemberSafeReason(code: string): code is MemberSafeReason {
  return (MEMBER_SAFE_REASONS as readonly string[]).includes(code);
}

/**
 * The code to store where the member can read it. Internal lane codes map
 * through MEMBER_LANE_REASON_OF; anything else outside the vocabulary becomes
 * `fallback`. With `trustMemberCode` (the member's own request), any other
 * lowercase code the member route chose is kept as it is.
 */
export function memberSafeReason(
  code: string | null | undefined,
  fallback: MemberSafeReason,
  options: { trustMemberCode?: boolean } = {},
): string {
  if (!code || !CODE.test(code)) return fallback;
  if (code in MEMBER_LANE_REASON_OF) return MEMBER_LANE_REASON_OF[code as LaneReasonCode];
  if (isMemberSafeReason(code)) return code;
  return options.trustMemberCode ? code : fallback;
}
