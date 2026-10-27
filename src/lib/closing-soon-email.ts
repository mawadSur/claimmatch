import { legalContact } from './legal-contact';
import { isVerifiedRecord } from './verified-fields';
import type { Lawsuit } from './types';
import { daysLeftToFile } from './utils';

/** Verified rows with a deadline in this many days may appear in the email. */
export const CLOSING_SOON_EMAIL_DAYS = 14;

export type ClosingSoonEmailSkip =
  | 'flag_off'
  | 'missing_postal_address'
  | 'missing_verified_sender'
  | 'missing_resend_key';

export type ClosingSoonEmailGate =
  | { ok: true }
  | { ok: false; reason: ClosingSoonEmailSkip };

const RESEND_DEV = /@resend\.dev\b/i;
const ONBOARDING_FROM = /onboarding@resend\.dev/i;

/**
 * A sender is "verified" only when RESEND_FROM is set to a real domain.
 * The Resend onboarding address is not a ClaimMatch inbox (B2 / B3).
 */
export function isVerifiedSender(from: string | null | undefined): boolean {
  const value = from?.trim();
  if (!value) return false;
  if (ONBOARDING_FROM.test(value) || RESEND_DEV.test(value)) return false;
  return /@/.test(value);
}

/**
 * Hard gate: never send unless the flag is exactly "1", a postal address
 * exists, and a verified sender is configured. Missing Resend key also refuses.
 */
export function closingSoonEmailGate(
  env: Record<string, string | undefined> = process.env,
): ClosingSoonEmailGate {
  if (env.CLOSING_SOON_EMAIL_ENABLED !== '1') {
    return { ok: false, reason: 'flag_off' };
  }
  if (!legalContact().postalAddress) {
    return { ok: false, reason: 'missing_postal_address' };
  }
  if (!isVerifiedSender(env.RESEND_FROM)) {
    return { ok: false, reason: 'missing_verified_sender' };
  }
  if (!env.RESEND_API_KEY?.trim()) {
    return { ok: false, reason: 'missing_resend_key' };
  }
  return { ok: true };
}

/** Verified listings with a real deadline in the next 14 days, soonest first. */
export function pickClosingSoonEmailRows<
  T extends Pick<
    Lawsuit,
    | 'title'
    | 'deadline'
    | 'verified_at'
    | 'eligibility_verified'
    | 'proof_verified'
    | 'administrator'
    | 'eligibility_text'
    | 'eligibility'
    | 'proof_required'
  >,
>(rows: readonly T[], now: Date = new Date()): T[] {
  return rows
    .filter((row) => {
      if (!isVerifiedRecord(row)) return false;
      const days = daysLeftToFile(row.deadline, now);
      return days !== null && days >= 0 && days <= CLOSING_SOON_EMAIL_DAYS;
    })
    .sort((a, b) => {
      const aAt = Date.parse(a.deadline ?? '');
      const bAt = Date.parse(b.deadline ?? '');
      return aAt - bAt || a.title.localeCompare(b.title);
    });
}
