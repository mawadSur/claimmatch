/**
 * Product analytics event names and the evidence each one requires.
 *
 * Login is not signup. Opening the official form is intent, not a filing.
 * A dashboard "I submitted this" label is feedback, not a confirmed filing.
 * Skip-onboarding is not profile completion.
 */

export const ANALYTICS_EVENTS = {
  landing_viewed: 'landing_viewed',
  settlement_viewed: 'settlement_viewed',
  signup_started: 'signup_started',
  signup_submitted: 'signup_submitted',
  signup_completed: 'signup_completed',
  signup_error: 'signup_error',
  login_completed: 'login_completed',
  profile_completed: 'profile_completed',
  matches_viewed: 'matches_viewed',
  match_viewed: 'match_viewed',
  official_form_opened: 'official_form_opened',
  prefill_opened: 'prefill_opened',
  prefill_completed: 'prefill_completed',
  claim_tracking_started: 'claim_tracking_started',
  claim_reported_filed: 'claim_reported_filed',
  match_feedback: 'match_feedback',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export const SIGNUP_EVIDENCE = ['session_after_signup', 'email_confirmed'] as const;
export type SignupEvidence = (typeof SIGNUP_EVIDENCE)[number];

export function profileCompletedProperties(input: {
  hasName: boolean;
  hasState: boolean;
}): { evidence: 'onboarding_saved'; has_name: boolean; has_state: boolean; onboarded: true } | null {
  if (!input.hasName && !input.hasState) return null;
  return {
    evidence: 'onboarding_saved',
    has_name: input.hasName,
    has_state: input.hasState,
    onboarded: true,
  };
}

export function matchesViewedProperties(input: {
  matchCount: number;
  strongCount: number;
  possibleCount: number;
}): { match_count: number; strong_count: number; possible_count: number } | null {
  if (input.matchCount < 1) return null;
  return {
    match_count: input.matchCount,
    strong_count: input.strongCount,
    possible_count: input.possibleCount,
  };
}

export function filingConfirmedProperties(input: {
  claimStatus: string;
  withConfirmationNumber: boolean;
}): {
  evidence: 'user_reported_and_saved';
  claim_status: string;
  with_confirmation_number: boolean;
  is_filing: true;
} | null {
  if (input.claimStatus !== 'reported_filed' && input.claimStatus !== 'submitted') return null;
  return {
    evidence: 'user_reported_and_saved',
    claim_status: input.claimStatus,
    with_confirmation_number: input.withConfirmationNumber,
    is_filing: true,
  };
}
