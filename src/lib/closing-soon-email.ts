import { legalContact } from './legal-contact';
import { isOpenForClaims } from './open-for-claims';
import { isVerifiedRecord } from './verified-fields';
import type { Lawsuit } from './types';
import { daysLeftToFile } from './utils';

/** Verified rows with a deadline in this many days may appear in the email. */
export const CLOSING_SOON_EMAIL_DAYS = 14;

export type CommercialEmailSkip =
  | 'missing_postal_address'
  | 'missing_verified_sender'
  | 'missing_resend_key';

export type ClosingSoonEmailSkip = 'flag_off' | CommercialEmailSkip;

export type ClosingSoonEmailGate =
  | { ok: true }
  | { ok: false; reason: ClosingSoonEmailSkip };

export type CommercialEmailGate =
  | { ok: true }
  | { ok: false; reason: CommercialEmailSkip };

const RESEND_DEV = /@resend\.dev\b/i;
const ONBOARDING_FROM = /onboarding@resend\.dev/i;

/**
 * A sender is "verified" only when RESEND_FROM is set to a real domain.
 * The Resend onboarding address is not a Lawsuit AI inbox (B2 / B3).
 */
export function isVerifiedSender(from: string | null | undefined): boolean {
  const value = from?.trim();
  if (!value) return false;
  if (ONBOARDING_FROM.test(value) || RESEND_DEV.test(value)) return false;
  return /@/.test(value);
}

/**
 * Shared CAN-SPAM / sender checks used by closing-soon, deadline reminders,
 * and onboarding drips. Does not look at a feature flag.
 */
export function commercialEmailPrereqs(
  env: Record<string, string | undefined> = process.env,
): CommercialEmailGate {
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
  return commercialEmailPrereqs(env);
}

/**
 * Verified listings open for claims (isOpenForClaims) with a real deadline in
 * the next 14 days, soonest first. Pass rows with the settlement guides
 * applied, as the digest cron does, so a guided settlement goes by its
 * official deadline.
 */
export function pickClosingSoonEmailRows<
  T extends Pick<
    Lawsuit,
    | 'slug'
    | 'title'
    | 'status'
    | 'review_status'
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
      if (!isVerifiedRecord(row) || !isOpenForClaims(row, now)) return false;
      const days = daysLeftToFile(row.deadline, now);
      return days !== null && days >= 0 && days <= CLOSING_SOON_EMAIL_DAYS;
    })
    .sort((a, b) => {
      const aAt = Date.parse(a.deadline ?? '');
      const bAt = Date.parse(b.deadline ?? '');
      return aAt - bAt || a.title.localeCompare(b.title);
    });
}
