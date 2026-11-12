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
  eligibility_quiz_started: 'eligibility_quiz_started',
  eligibility_quiz_completed: 'eligibility_quiz_completed',
  prefill_opened: 'prefill_opened',
  prefill_completed: 'prefill_completed',
  claim_tracking_started: 'claim_tracking_started',
  claim_reported_filed: 'claim_reported_filed',
  match_feedback: 'match_feedback',
  beta_code_visit: 'beta_code_visit',
  beta_feedback_shown: 'beta_feedback_shown',
  beta_feedback_submitted: 'beta_feedback_submitted',
  claim_timeline_viewed: 'claim_timeline_viewed',
  match_reason_viewed: 'match_reason_viewed',
  scorecard_viewed: 'scorecard_viewed',
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

export const BETA_FEEDBACK_TRIGGERS = ['matches', 'filing'] as const;
export type BetaFeedbackTrigger = (typeof BETA_FEEDBACK_TRIGGERS)[number];

/** Invite-landing visit. Booleans only — never the code string or other PII. */
export function betaCodeVisitProperties(input: { hasCode: boolean }): { has_code: boolean } {
  return { has_code: input.hasCode };
}

export function betaFeedbackShownProperties(input: {
  trigger: BetaFeedbackTrigger;
}): { trigger: BetaFeedbackTrigger } {
  return { trigger: input.trigger };
}

/**
 * Feedback submit or dismiss. Booleans and the closed-set trigger only —
 * never free-text answers, email, or other PII.
 */
export function betaFeedbackSubmittedProperties(input: {
  trigger?: BetaFeedbackTrigger | null;
  interviewOptIn: boolean;
  hasAlmostStopped: boolean;
  hasWhatsMissing: boolean;
  dismissed: boolean;
}): {
  interview_opt_in: boolean;
  has_almost_stopped: boolean;
  has_whats_missing: boolean;
  dismissed: boolean;
  trigger?: BetaFeedbackTrigger;
} {
  const props: {
    interview_opt_in: boolean;
    has_almost_stopped: boolean;
    has_whats_missing: boolean;
    dismissed: boolean;
    trigger?: BetaFeedbackTrigger;
  } = {
    interview_opt_in: input.interviewOptIn,
    has_almost_stopped: input.hasAlmostStopped,
    has_whats_missing: input.hasWhatsMissing,
    dismissed: input.dismissed,
  };
  if (input.trigger) props.trigger = input.trigger;
  return props;
}

/** Timeline viewed. Source only — never confirmation numbers or dates. */
export function claimTimelineViewedProperties(input: {
  source: 'dashboard' | 'claim';
}): { source: 'dashboard' | 'claim' } {
  return { source: input.source };
}

/** Match-reason line shown. Count only — never the reason text. */
export function matchReasonViewedProperties(input: { matchCount: number }): { match_count: number } {
  return { match_count: Math.max(0, Math.floor(input.matchCount)) };
}
