import { eligibilitySummary } from './claim-input';
import { flags } from './flags';
import { normalizeProof, proofLabel, proofStatus } from './proof';
import type { Lawsuit, ProofRequired } from './types';
import { formatDeadline } from './utils';

/**
 * C7 verified-field helpers. The public badge is off until
 * VERIFIED_FIELDS_ENABLED=1. Admin write paths do not call these.
 */

export const PROOF_VERIFIED_VALUES = ['yes', 'no', 'optional', 'unknown'] as const;

export type ProofVerified = (typeof PROOF_VERIFIED_VALUES)[number];

export type VerifiedFieldSource = Pick<
  Lawsuit,
  | 'verified_at'
  | 'eligibility_verified'
  | 'proof_verified'
  | 'administrator'
  | 'eligibility_text'
  | 'eligibility'
  | 'proof_required'
>;

export function isProofVerified(value: unknown): value is ProofVerified {
  return typeof value === 'string' && (PROOF_VERIFIED_VALUES as readonly string[]).includes(value);
}

/** At least one human-checked field has content (not just a timestamp). */
export function hasVerifiedFieldContent(row: VerifiedFieldSource): boolean {
  if (row.eligibility_verified?.trim()) return true;
  if (isProofVerified(row.proof_verified)) return true;
  if (row.administrator?.trim()) return true;
  return false;
}

/**
 * A row is publicly verifiable when an admin stamped it and left at least one
 * verified field. No stamp, or a stamp with empty fields, never shows a badge.
 */
export function isVerifiedRecord(row: VerifiedFieldSource): boolean {
  return Boolean(row.verified_at) && hasVerifiedFieldContent(row);
}

/** Public badge: flag on, stamp set, and verified fields are non-empty. */
export function showVerifiedBadge(row: VerifiedFieldSource): boolean {
  return flags.verifiedFields() && isVerifiedRecord(row);
}

/** "Verified on Oct 27, 2026", or null when the stamp is unreadable. */
export function verifiedOnLabel(verifiedAt: string | null | undefined): string | null {
  if (!verifiedAt) return null;
  const formatted = formatDeadline(verifiedAt);
  if (formatted === 'Varies') return null;
  return `Verified on ${formatted}`;
}

/**
 * Who-qualifies text for public pages: verified copy when the flag is on and
 * the row is verified, otherwise the feed summary (placeholders stay empty).
 */
export function displayEligibilityText(row: VerifiedFieldSource): string | null {
  if (showVerifiedBadge(row)) {
    const verified = row.eligibility_verified?.trim();
    if (verified) return verified;
  }
  return eligibilitySummary(row.eligibility_text);
}

/** Proof rule: verified value when the flag is on and the row is verified. */
export function displayProofStatus(row: VerifiedFieldSource): ProofRequired {
  if (showVerifiedBadge(row) && isProofVerified(row.proof_verified)) {
    return normalizeProof(row.proof_verified);
  }
  return proofStatus(row);
}

export function displayProofLabel(row: VerifiedFieldSource): string {
  if (showVerifiedBadge(row) && isProofVerified(row.proof_verified)) {
    return proofLabel({
      proof_required: false,
      eligibility: { proof: normalizeProof(row.proof_verified) },
    });
  }
  return proofLabel(row);
}

/** Overlay verified who-qualifies / proof / administrator onto answer facts. */
export function overlayVerifiedFacts<
  T extends {
    qualifies: string | null;
    proof: string;
    administrator: string | null;
    missing?: string[];
  },
>(facts: T, row: VerifiedFieldSource): T {
  if (!showVerifiedBadge(row)) return facts;
  const who = row.eligibility_verified?.trim() || facts.qualifies;
  const admin = row.administrator?.trim() || facts.administrator;
  const proof = isProofVerified(row.proof_verified) ? displayProofLabel(row) : facts.proof;
  const missing = facts.missing?.filter((label) => {
    if (label === 'who qualifies' && who) return false;
    if (label === 'administrator' && admin) return false;
    return true;
  });
  return {
    ...facts,
    qualifies: who,
    proof,
    administrator: admin,
    ...(missing ? { missing } : {}),
  };
}
