import { describe, expect, it } from 'vitest';
import {
  isEmailableStoredMatch,
  MATCH_EMAIL_SCORE_THRESHOLD,
  matchEmailCadence,
  wantsInstantMatchEmails,
  wantsWeeklyMatchEmails,
} from '@/lib/match-email';
import { RULE_VERIFIED_FLOOR } from '@/lib/matching';
import { renderMatchEmail } from '@/lib/email';

describe('match email gates', () => {
  it('uses the rule-verified floor as the send threshold', () => {
    expect(MATCH_EMAIL_SCORE_THRESHOLD).toBe(RULE_VERIFIED_FLOOR);
    expect(MATCH_EMAIL_SCORE_THRESHOLD).toBe(0.5);
  });

  it('treats opted-out accounts as off', () => {
    expect(matchEmailCadence({ email_opt_in: false, email_frequency: 'instant' })).toBe('off');
    expect(wantsInstantMatchEmails({ email_opt_in: false, email_frequency: 'instant' })).toBe(false);
    expect(wantsWeeklyMatchEmails({ email_opt_in: false, email_frequency: 'weekly' })).toBe(false);
  });

  it('keeps older opted-in rows on instant when frequency is unset', () => {
    expect(matchEmailCadence({ email_opt_in: true, email_frequency: null })).toBe('instant');
    expect(wantsInstantMatchEmails({ email_opt_in: true, email_frequency: undefined })).toBe(true);
    expect(wantsWeeklyMatchEmails({ email_opt_in: true, email_frequency: null })).toBe(false);
  });

  it('honors an explicit weekly choice', () => {
    expect(matchEmailCadence({ email_opt_in: true, email_frequency: 'weekly' })).toBe('weekly');
    expect(wantsWeeklyMatchEmails({ email_opt_in: true, email_frequency: 'weekly' })).toBe(true);
    expect(wantsInstantMatchEmails({ email_opt_in: true, email_frequency: 'weekly' })).toBe(false);
  });

  it('emails only unnotified, undismissed rows at or above the threshold', () => {
    expect(isEmailableStoredMatch({ score: 0.5, dismissed: false, notified_at: null })).toBe(true);
    expect(isEmailableStoredMatch({ score: 0.49, dismissed: false, notified_at: null })).toBe(false);
    expect(isEmailableStoredMatch({ score: 0.9, dismissed: true, notified_at: null })).toBe(false);
    expect(isEmailableStoredMatch({ score: 0.9, dismissed: false, notified_at: '2026-11-01T00:00:00Z' })).toBe(false);
  });
});

describe('match email CAN-SPAM footer', () => {
  it('includes the commercial notice, unsubscribe link, and why they received it', () => {
    const html = renderMatchEmail({
      name: 'Ada',
      to: 'ada@example.com',
      matches: [{ title: 'Example settlement', slug: 'example', deadline: '2026-12-01' }],
    });
    expect(html).toMatch(/This is a commercial email/);
    expect(html).toMatch(/Unsubscribe/);
    expect(html).toMatch(/opted in to match alerts/);
    expect(html).toContain('/unsubscribe');
    expect(html).toContain('/settings');
    expect(html).toContain('Lawsuit AI');
    expect(html).not.toContain('ClaimMatch');
  });
});
