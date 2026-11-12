import { afterEach, describe, expect, it, vi } from 'vitest';
import { feeEveryClaimCopy } from '@/lib/copy';
import {
  MATCH_ALERT_MAX_CLAIMS,
  isAlertableLawsuit,
  matchAlertEmailsEnabled,
  matchAlertSendBlocked,
  planPersonAlert,
  publicMatchReasons,
  scoreSubscriberMatch,
  withinWeeklyCap,
} from '@/lib/match-alert';
import {
  hashMatchAlertToken,
  issueMatchAlertToken,
  parseMatchAlertToken,
} from '@/lib/match-alert-token';
import { previewMatchAlertEmail, renderMatchAlertEmail, sendMatchAlertEmail } from '@/lib/match-alert-email';
import { sendMatchAlerts } from '@/lib/match-alert-job';
import { encodeUnsubscribeToken, listUnsubscribeHeaders } from '@/lib/unsubscribe';
import { makeLawsuit, makeProfile } from './helpers';

const SECRET = 'test-match-alert-secret';
const LAWSUIT_ID = '11111111-1111-4111-8111-111111111111';

function verifiedLawsuit(overrides: Parameters<typeof makeLawsuit>[1] = {}) {
  return makeLawsuit(
    { states: ['CA'] },
    {
      id: LAWSUIT_ID,
      slug: 'verified-open',
      title: 'Verified open settlement',
      status: 'open',
      review_status: 'published',
      deadline: '2027-12-01',
      verified_at: '2026-01-15T00:00:00.000Z',
      eligibility_verified: 'Checked against the official notice.',
      administrator: 'Example Admin',
      ...overrides,
    },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MATCH_ALERT_EMAILS_ENABLED', () => {
  it('is on only when the env var is exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', 'yes', ' 1', '1 ']) {
      vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', value);
      expect(matchAlertEmailsEnabled()).toBe(false);
    }
    vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '1');
    expect(matchAlertEmailsEnabled()).toBe(true);
  });

  it('never sends from tests even when the flag and Resend look configured', () => {
    vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '1');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM', 'ClaimMatch <hello@claimmatch.com>');
    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '1 Main St');
    const blocked = matchAlertSendBlocked();
    expect(blocked.blocked).toBe(true);
    if (blocked.blocked) {
      expect(blocked.reason).toBe('test_env');
    }
  });

  it('skips the job without loading data when the flag is off', async () => {
    vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '');
    const result = await sendMatchAlerts();
    expect(result).toMatchObject({ skipped: 'flag_off', emailed: 0, planned: 0, dryRun: false });
  });

  it('refuses sendMatchAlertEmail from tests even with a Resend key', async () => {
    vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '1');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM', 'ClaimMatch <hello@claimmatch.com>');
    const sent = await sendMatchAlertEmail({
      to: 'ada@example.com',
      claims: [
        {
          lawsuitId: LAWSUIT_ID,
          slug: 'verified-open',
          title: 'Verified open settlement',
          deadline: '2027-12-01',
          reasons: ['Available in your state (CA)'],
          score: 0.75,
          startUrl: 'https://lawsuitai.org/match-alert/start?t=token',
        },
      ],
    });
    expect(sent).toBe(false);
  });
});

describe('match-alert tokens', () => {
  it('round-trips a signed token tied to email + claim', () => {
    const now = new Date('2026-11-12T12:00:00.000Z');
    const issued = issueMatchAlertToken({
      email: 'Ada@Example.com',
      lawsuitId: LAWSUIT_ID,
      now,
      secret: SECRET,
      nonce: 'abcd1234efgh5678',
    });
    expect(issued.tokenHash).toBe(hashMatchAlertToken(issued.token));
    const parsed = parseMatchAlertToken(issued.token, SECRET, now);
    expect(parsed).toMatchObject({
      ok: true,
      email: 'ada@example.com',
      lawsuitId: LAWSUIT_ID,
    });
  });

  it('rejects a bad signature, expiry, and a different secret', () => {
    const now = new Date('2026-11-12T12:00:00.000Z');
    const issued = issueMatchAlertToken({
      email: 'ada@example.com',
      lawsuitId: LAWSUIT_ID,
      now,
      ttlMs: 60_000,
      secret: SECRET,
    });
    expect(parseMatchAlertToken(issued.token + 'x', SECRET, now).ok).toBe(false);
    expect(parseMatchAlertToken(issued.token, 'other-secret', now).ok).toBe(false);
    expect(parseMatchAlertToken(issued.token, SECRET, new Date(now.getTime() + 61_000))).toEqual({
      ok: false,
      error: 'expired',
    });
  });

  it('hashes the raw token so the secret material is not stored', () => {
    const issued = issueMatchAlertToken({
      email: 'ada@example.com',
      lawsuitId: LAWSUIT_ID,
      secret: SECRET,
    });
    expect(issued.tokenHash).not.toContain(issued.token);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('cap and match filters', () => {
  it('skips a person who already got an alert this week', () => {
    const now = new Date('2026-11-12T12:00:00.000Z');
    expect(withinWeeklyCap(now.toISOString(), now)).toBe(true);
    expect(withinWeeklyCap(new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe(
      false,
    );
    const plan = planPersonAlert({
      person: {
        email: 'ada@example.com',
        source: 'profile',
        profile: makeProfile({ state: 'CA', email_opt_in: true, attributes: { had_data_breach: true } }),
      },
      lawsuits: [verifiedLawsuit({ eligibility: { states: ['CA'], requires: ['had_data_breach'] } })],
      alreadySentLawsuitIds: new Set(),
      lastSentAt: now.toISOString(),
      now,
    });
    expect(plan.skip).toBe('weekly_cap');
    expect(plan.claims).toEqual([]);
  });

  it('caps at 3 claims and skips unverified, past-deadline, and already-notified rows', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ];
    const open = ids.map((id, i) =>
      verifiedLawsuit({
        id,
        slug: `claim-${i}`,
        title: `Claim ${i}`,
        eligibility: { states: ['CA'], requires: ['had_data_breach'] },
      }),
    );
    const unverified = verifiedLawsuit({
      id: '55555555-5555-4555-8555-555555555555',
      slug: 'unverified',
      verified_at: null,
      eligibility_verified: null,
      administrator: null,
      eligibility: { states: ['CA'], requires: ['had_data_breach'] },
    });
    const expired = verifiedLawsuit({
      id: '66666666-6666-4666-8666-666666666666',
      slug: 'expired',
      deadline: '2020-01-01',
      eligibility: { states: ['CA'], requires: ['had_data_breach'] },
    });
    expect(isAlertableLawsuit(unverified, now)).toBe(false);
    expect(isAlertableLawsuit(expired, now)).toBe(false);

    const plan = planPersonAlert({
      person: {
        email: 'ada@example.com',
        source: 'profile',
        profile: makeProfile({ state: 'CA', email_opt_in: true, attributes: { had_data_breach: true } }),
      },
      lawsuits: [...open, unverified, expired],
      alreadySentLawsuitIds: new Set([ids[0]]),
      now,
    });
    expect(plan.skip).toBeUndefined();
    expect(plan.claims).toHaveLength(MATCH_ALERT_MAX_CLAIMS);
    expect(plan.claims.map((c) => c.slug)).not.toContain('claim-0');
    expect(plan.claims.map((c) => c.slug)).not.toContain('unverified');
    expect(plan.claims.map((c) => c.slug)).not.toContain('expired');
  });

  it('honors unsubscribe on a profile and skips empty subscriber rows', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const lawsuit = verifiedLawsuit();
    expect(
      planPersonAlert({
        person: {
          email: 'ada@example.com',
          source: 'profile',
          profile: makeProfile({ email_opt_in: false, state: 'CA' }),
        },
        lawsuits: [lawsuit],
        alreadySentLawsuitIds: new Set(),
        now,
      }).skip,
    ).toBe('unsubscribed');
    expect(
      planPersonAlert({
        person: { email: 'lead@example.com', source: 'subscriber' },
        lawsuits: [lawsuit],
        alreadySentLawsuitIds: new Set(),
        now,
      }).skip,
    ).toBe('empty_profile');
  });

  it('matches a confirmed subscriber by state without health reasons', () => {
    const lawsuit = verifiedLawsuit({ category: 'Data Breach' });
    const result = scoreSubscriberMatch({ state: 'CA', interests: ['data breach'] }, lawsuit);
    expect(result.eligible).toBe(true);
    expect(publicMatchReasons(['Available in your state (CA)', 'took_medication for a condition'])).toEqual([
      'Available in your state (CA)',
    ]);
    expect(result.reasons.join(' ')).not.toMatch(/medication|health/i);
  });
});

describe('match-alert email', () => {
  it('is short, has a start button, CAN-SPAM footer, and no payout or extra fee claims', () => {
    const html = renderMatchAlertEmail({
      to: 'ada@example.com',
      name: 'Ada',
      claims: [
        {
          lawsuitId: LAWSUIT_ID,
          slug: 'verified-open',
          title: 'Verified open settlement',
          deadline: '2027-12-01',
          reasons: ['Available in your state (CA)'],
          score: 0.75,
          startUrl: 'https://lawsuitai.org/match-alert/start?t=token',
        },
      ],
    });
    expect(html).toContain('Start this claim');
    expect(html).toContain('Verified open settlement');
    expect(html).toContain('Why it may match: Available in your state (CA)');
    expect(html).toContain('/unsubscribe?e=');
    expect(html).toContain('/how-we-make-money');
    expect(html).toContain('This is a commercial email');
    expect(html).not.toContain(feeEveryClaimCopy());
    expect(html).not.toContain('Typical payout');
    expect(html).not.toMatch(/guaranteed/i);
    expect(html).not.toContain('took_medication');
    const preview = previewMatchAlertEmail('preview@example.com');
    expect(preview).toContain('Start this claim');
    expect(preview).toContain(encodeUnsubscribeToken('preview@example.com'));
  });

  it('exposes List-Unsubscribe headers for one-click RFC 8058', () => {
    const headers = listUnsubscribeHeaders('ada@example.com', 'https://claimmatch.test');
    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/claimmatch\.test\/api\/unsubscribe\?e=/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
