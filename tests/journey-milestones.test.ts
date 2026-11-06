import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS,
  filingConfirmedProperties,
  matchesViewedProperties,
  profileCompletedProperties,
} from '@/lib/analytics/events';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

/**
 * Isolated contract for the real product journey. These are not the 100
 * simulated buyers. Authenticated writes against a live database are blocked
 * without local secrets; this file checks that the code only emits a
 * milestone when the matching state exists.
 */
describe('genuine journey events require evidence', () => {
  it('keeps signup, login, profile, match intent, and confirmed filing as separate names', () => {
    expect(ANALYTICS_EVENTS.signup_completed).toBe('signup_completed');
    expect(ANALYTICS_EVENTS.login_completed).toBe('login_completed');
    expect(ANALYTICS_EVENTS.profile_completed).toBe('profile_completed');
    expect(ANALYTICS_EVENTS.official_form_opened).toBe('official_form_opened');
    expect(ANALYTICS_EVENTS.eligibility_quiz_started).toBe('eligibility_quiz_started');
    expect(ANALYTICS_EVENTS.eligibility_quiz_completed).toBe('eligibility_quiz_completed');
    expect(ANALYTICS_EVENTS.claim_reported_filed).toBe('claim_reported_filed');
    expect(ANALYTICS_EVENTS.match_feedback).toBe('match_feedback');
    expect(ANALYTICS_EVENTS.signup_completed).not.toBe(ANALYTICS_EVENTS.login_completed);
    expect(ANALYTICS_EVENTS.official_form_opened).not.toBe(ANALYTICS_EVENTS.claim_reported_filed);
  });

  it('wires signup_completed only after a session or a confirmed-email landing', () => {
    const auth = read('src/components/AuthForm.tsx');
    const onboarding = read('src/app/onboarding/page.tsx');
    expect(auth).toContain("evidence: 'session_after_signup'");
    expect(onboarding).toContain("evidence: 'email_confirmed'");
    expect(onboarding).toContain('emailConfirmed');
    expect(auth).not.toContain("capture('signup_completed')");
  });

  it('does not treat skip-onboarding or an empty profile as profile_completed', () => {
    expect(profileCompletedProperties({ hasName: false, hasState: false })).toBeNull();
    const wizard = read('src/components/OnboardingWizard.tsx');
    expect(wizard).toContain('saved.profile');
    expect(wizard).toContain('profileCompletedProperties');
    expect(wizard).toContain("kind === 'save'");
  });

  it('does not treat an empty match list or an official-form click as filed', () => {
    expect(matchesViewedProperties({ matchCount: 0, strongCount: 0, possibleCount: 0 })).toBeNull();
    expect(
      filingConfirmedProperties({ claimStatus: 'self_file', withConfirmationNumber: false }),
    ).toBeNull();
    const flow = read('src/components/claims/ClaimFlow.tsx');
    expect(flow).toContain("intent: 'official_form'");
    expect(flow).toContain('is_filing: false');
    expect(read('src/components/claims/MatchFeedback.tsx')).toContain('is_filing: false');
    expect(read('src/components/claims/ReportFiled.tsx')).toContain('filingConfirmedProperties');
  });
});
