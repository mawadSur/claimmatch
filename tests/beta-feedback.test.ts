import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS,
  betaFeedbackShownProperties,
  betaFeedbackSubmittedProperties,
} from '@/lib/analytics/events';
import { parseBetaFeedbackInput, betaFeedbackInsertRow } from '@/lib/beta-feedback';

describe('beta feedback parse + events', () => {
  it('accepts a short answer, opt-in, or dismiss, and clips free text', () => {
    expect(parseBetaFeedbackInput(null).ok).toBe(false);
    expect(parseBetaFeedbackInput({}).ok).toBe(false);
    const dismissed = parseBetaFeedbackInput({ dismissed: true, almost_stopped: 'secret' });
    expect(dismissed).toEqual({
      ok: true,
      input: {
        almostStopped: null,
        whatsMissing: null,
        interviewOptIn: false,
        dismissed: true,
        trigger: null,
      },
    });
    const saved = parseBetaFeedbackInput({
      almost_stopped: `  ${'x'.repeat(520)}  `,
      interview_opt_in: true,
      trigger: 'matches',
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.input.almostStopped).toHaveLength(500);
    expect(saved.input.interviewOptIn).toBe(true);
    expect(saved.input.trigger).toBe('matches');
    expect(betaFeedbackInsertRow('user-1', saved.input)).toMatchObject({
      user_id: 'user-1',
      interview_opt_in: true,
      dismissed: false,
    });
  });

  it('PostHog payloads are booleans and closed-set triggers, never free text', () => {
    expect(ANALYTICS_EVENTS.beta_feedback_shown).toBe('beta_feedback_shown');
    expect(ANALYTICS_EVENTS.beta_feedback_submitted).toBe('beta_feedback_submitted');
    expect(betaFeedbackShownProperties({ trigger: 'filing' })).toEqual({ trigger: 'filing' });
    const submitted = betaFeedbackSubmittedProperties({
      trigger: 'matches',
      interviewOptIn: true,
      hasAlmostStopped: true,
      hasWhatsMissing: false,
      dismissed: false,
    });
    expect(submitted).toEqual({
      interview_opt_in: true,
      has_almost_stopped: true,
      has_whats_missing: false,
      dismissed: false,
      trigger: 'matches',
    });
    expect(JSON.stringify(submitted)).not.toMatch(/almost stopped|email|phone/i);
  });
});
