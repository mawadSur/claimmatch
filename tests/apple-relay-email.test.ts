import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isEmailAddress } from '@/lib/jev/formats';
import {
  emailMatchCandidates,
  encodeUnsubscribeToken,
  isPlausibleEmail,
  maskEmail,
  parseUnsubscribeToken,
  unsubscribePageUrl,
} from '@/lib/unsubscribe';
import { normalizeAlertEmail } from '@/lib/match-alert-token';
import { isInternalEmail } from '@/lib/internal-users';
import { maskEmail as adminMaskEmail } from '@/lib/admin-access';
import { renderWelcomeEmail } from '@/lib/email';
import { subscriberDistinctId } from '@/lib/analytics/server';

/**
 * Sign in with Apple's "Hide My Email" gives a private relay address. It is
 * an ordinary address: nothing in Lawsuit AI may assume a domain, so every
 * check and helper that touches an email must accept it.
 */
const RELAY = 'x7k2m9q4ab@privaterelay.appleid.com';
const RELAY_MIXED = 'X7K2M9Q4AB@PrivateRelay.AppleID.com';

describe('Apple private relay addresses work wherever emails are used', () => {
  it('pass every email shape check', () => {
    expect(isEmailAddress(RELAY)).toBe(true);
    expect(isPlausibleEmail(RELAY)).toBe(true);
    // The filing packet and member schemas use zod's email check.
    expect(z.string().email().max(320).safeParse(RELAY).success).toBe(true);
  });

  it('round-trip through unsubscribe links, and match the stored lowercase address', () => {
    const parsed = parseUnsubscribeToken(encodeUnsubscribeToken(RELAY));
    expect(parsed).toEqual({ ok: true, kind: 'unsigned-v0', email: RELAY });
    expect(unsubscribePageUrl(RELAY, 'https://lawsuitai.org')).toContain('https://lawsuitai.org/unsubscribe');
    expect(emailMatchCandidates(RELAY_MIXED)).toContain(RELAY);
    expect(normalizeAlertEmail(` ${RELAY_MIXED} `)).toBe(RELAY);
  });

  it('mask and hash like any other address', () => {
    expect(maskEmail(RELAY)).toMatch(/@privaterelay\.appleid\.com$/);
    expect(maskEmail(RELAY)).not.toContain('x7k2m9q4ab');
    expect(adminMaskEmail(RELAY)).not.toContain('x7k2m9q4ab');
    expect(subscriberDistinctId(RELAY)).toBe(subscriberDistinctId(RELAY_MIXED));
  });

  it('is never mistaken for an internal tester, and the welcome email renders for it', () => {
    expect(isInternalEmail(RELAY, ['founder@example.com'])).toBe(false);
    expect(isInternalEmail(RELAY_MIXED, [RELAY])).toBe(true);
    const html = renderWelcomeEmail(undefined, RELAY);
    expect(html).toContain('Hi there,');
  });
});
