import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DID_YOU_FILE_AFTER_MS,
  INCOMPLETE_ONBOARDING_AFTER_MS,
  isAtLeastMsAgo,
  pickDidYouFileDrip,
  pickIncompleteOnboardingDrip,
  sendOnboardingDrips,
} from '@/lib/onboarding-drip';
import { renderDidYouFileEmail, renderIncompleteOnboardingEmail } from '@/lib/email';

describe('onboarding drip time boundaries', () => {
  const now = new Date('2026-11-06T15:00:00.000Z');

  it('treats exactly 24h as eligible and 24h minus 1ms as too soon', () => {
    const exactly = new Date(now.getTime() - INCOMPLETE_ONBOARDING_AFTER_MS).toISOString();
    const almost = new Date(now.getTime() - INCOMPLETE_ONBOARDING_AFTER_MS + 1).toISOString();
    expect(isAtLeastMsAgo(exactly, now, INCOMPLETE_ONBOARDING_AFTER_MS)).toBe(true);
    expect(isAtLeastMsAgo(almost, now, INCOMPLETE_ONBOARDING_AFTER_MS)).toBe(false);
  });

  it('treats exactly 3 days as eligible for did-you-file', () => {
    const exactly = new Date(now.getTime() - DID_YOU_FILE_AFTER_MS).toISOString();
    const almost = new Date(now.getTime() - DID_YOU_FILE_AFTER_MS + 1).toISOString();
    expect(isAtLeastMsAgo(exactly, now, DID_YOU_FILE_AFTER_MS)).toBe(true);
    expect(isAtLeastMsAgo(almost, now, DID_YOU_FILE_AFTER_MS)).toBe(false);
  });
});

describe('incomplete onboarding drip selection', () => {
  const now = new Date('2026-11-06T15:00:00.000Z');
  const createdAt = new Date(now.getTime() - INCOMPLETE_ONBOARDING_AFTER_MS).toISOString();

  it('sends once for an opted-in incomplete profile at the 24h boundary', () => {
    expect(
      pickIncompleteOnboardingDrip(
        {
          userId: 'u1',
          email: 'a@example.com',
          name: 'Ada',
          onboarded: false,
          emailOptIn: true,
          createdAt,
          alreadySent: false,
        },
        now,
      ),
    ).toMatchObject({ kind: 'incomplete_onboarding', userId: 'u1', email: 'a@example.com' });
  });

  it('skips onboarded, opted-out, too-new, and already-sent rows', () => {
    const base = {
      userId: 'u1',
      email: 'a@example.com',
      onboarded: false,
      emailOptIn: true,
      createdAt,
      alreadySent: false,
    };
    expect(pickIncompleteOnboardingDrip({ ...base, onboarded: true }, now)).toBeNull();
    expect(pickIncompleteOnboardingDrip({ ...base, emailOptIn: false }, now)).toBeNull();
    expect(pickIncompleteOnboardingDrip({ ...base, alreadySent: true }, now)).toBeNull();
    expect(
      pickIncompleteOnboardingDrip(
        { ...base, createdAt: new Date(now.getTime() - INCOMPLETE_ONBOARDING_AFTER_MS + 1).toISOString() },
        now,
      ),
    ).toBeNull();
  });
});

describe('did-you-file drip selection', () => {
  const now = new Date('2026-11-06T15:00:00.000Z');
  const lastOpenIntentAt = new Date(now.getTime() - DID_YOU_FILE_AFTER_MS).toISOString();
  const base = {
    userId: 'u1',
    email: 'a@example.com',
    name: 'Ada',
    claimId: 'c1',
    status: 'self_file',
    slug: 'acme',
    title: 'Acme Settlement',
    deadline: '2026-12-01',
    lastOpenIntentAt,
    alreadySent: false,
  };

  it('sends once per claim when official-form intent is at least 3 days old', () => {
    expect(pickDidYouFileDrip(base, now)).toMatchObject({
      kind: 'did_you_file',
      claimId: 'c1',
      slug: 'acme',
    });
  });

  it('is idempotent and skips filed, closed, late, and too-recent intent', () => {
    expect(pickDidYouFileDrip({ ...base, alreadySent: true }, now)).toBeNull();
    expect(pickDidYouFileDrip({ ...base, status: 'reported_filed' }, now)).toBeNull();
    expect(pickDidYouFileDrip({ ...base, status: 'not_reported_filed' }, now)).toBeNull();
    expect(pickDidYouFileDrip({ ...base, deadline: '2026-11-01' }, now)).toBeNull();
    expect(
      pickDidYouFileDrip(
        {
          ...base,
          lastOpenIntentAt: new Date(now.getTime() - DID_YOU_FILE_AFTER_MS + 1).toISOString(),
        },
        now,
      ),
    ).toBeNull();
  });
});

describe('onboarding drip email copy', () => {
  it('links to onboarding and includes unsubscribe, with no invented counts', () => {
    const html = renderIncompleteOnboardingEmail({ name: 'Ada', to: 'a@example.com' });
    expect(html).toContain('/onboarding');
    expect(html).toContain('/unsubscribe');
    expect(html).not.toMatch(/thousands|users like you|99%/i);
  });

  it('deep-links the did-you-file email to the claim page', () => {
    const html = renderDidYouFileEmail({
      title: 'Acme Settlement',
      slug: 'acme-settlement',
      to: 'a@example.com',
    });
    expect(html).toContain('/claim/acme-settlement');
    expect(html).toContain('Acme Settlement');
    expect(html).toContain('/unsubscribe');
    expect(html).not.toMatch(/thousands|users like you|99%/i);
  });
});

describe('sendOnboardingDrips flag and sender gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops when the flag is off', async () => {
    const result = await sendOnboardingDrips();
    expect(result).toEqual({
      candidates: 0,
      emailed: 0,
      incompleteOnboarding: 0,
      didYouFile: 0,
      skipped: 'ONBOARDING_DRIP_ENABLED is off',
    });
  });

  it('refuses without a postal address even when the flag is on', async () => {
    vi.stubEnv('ONBOARDING_DRIP_ENABLED', '1');
    vi.stubEnv('RESEND_FROM', 'ClaimMatch <hello@claimmatch.com>');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '');
    const result = await sendOnboardingDrips();
    expect(result.emailed).toBe(0);
    expect(result.skipped).toBe('missing_postal_address');
  });
});
