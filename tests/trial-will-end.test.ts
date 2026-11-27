import { afterEach, describe, expect, it, vi } from 'vitest';
import { membershipPriceCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { renderTrialWillEndEmail } from '@/lib/email';
import {
  sendTrialWillEndReminder,
  trialPriceCopy,
  trialWillEndFacts,
} from '@/lib/trial-will-end';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TRIAL_WILL_END_EMAIL_ENABLED', () => {
  it('defaults off and the webhook helper no-ops', async () => {
    expect(flags.trialWillEndEmail()).toBe(false);
    expect(
      await sendTrialWillEndReminder({
        userId: 'user-1',
        customerId: 'cus_1',
        subscription: { id: 'sub_1', trial_end: 1_800_000_000 },
      }),
    ).toEqual({ sent: false, reason: 'flag_off' });
  });

  it('builds facts from Stripe trial_end and the published monthly price', () => {
    const facts = trialWillEndFacts({
      subscriptionId: 'sub_1',
      trialEndUnix: 1_800_000_000,
      priceCopy: membershipPriceCopy(),
      manageUrl: 'https://billing.stripe.com/session',
    });
    expect(facts?.subscriptionId).toBe('sub_1');
    expect(facts?.trialEndIso).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(facts?.priceCopy).toBe('$19.99');
    expect(facts?.manageUrl).toContain('billing.stripe.com');
    expect(trialWillEndFacts({ subscriptionId: '', priceCopy: '$19.99', manageUrl: '/settings' })).toBeNull();
  });

  it('prefers Stripe unit_amount when the item is monthly', () => {
    expect(trialPriceCopy({ items: { data: [{ price: { unit_amount: 1999, recurring: { interval: 'month' } } }] } })).toBe(
      '$19.99',
    );
    expect(trialPriceCopy({})).toBe('$19.99');
  });
});

describe('trial_will_end email copy', () => {
  it('states the trial end date, $19.99/month, and a manage/cancel link', () => {
    const html = renderTrialWillEndEmail({
      trialEndLabel: 'Dec 4, 2026',
      priceCopy: '$19.99',
      manageUrl: 'https://billing.stripe.com/session/test',
      to: 'ada@example.com',
    });
    expect(html).toContain('Dec 4, 2026');
    expect(html).toContain('$19.99/month');
    expect(html).toContain('https://billing.stripe.com/session/test');
    expect(html).toContain('Manage or cancel');
    expect(html).toContain('Unsubscribe');
    expect(html).not.toMatch(/never takes a cut|15%/i);
  });
});
