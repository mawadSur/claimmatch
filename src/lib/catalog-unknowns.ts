import { flags } from './flags';
import { displayProofLabel, displayProofStatus } from './verified-fields';
import type { Lawsuit, ProofRequired } from './types';

/**
 * Catalog leftover from the panel-trust pass: cards still printed "Unknown"
 * / "Not stated" for empty proof, payout, and deadline. When
 * CATALOG_HIDE_UNKNOWNS_ENABLED=1, omit those rows and keep one honest
 * "we don't have these details yet" line instead.
 */

export function hideUnknownCatalogFields(): boolean {
  return flags.catalogHideUnknowns();
}

/** Hide unknown payout/proof on settlement facts when either trust-copy or this leftover flag is on. */
export function hideUnknownSettlementFacts(): boolean {
  return flags.panelTrustCopy() || flags.catalogHideUnknowns();
}

type ProofFields = Pick<
  Lawsuit,
  | 'proof_required'
  | 'eligibility'
  | 'proof_verified'
  | 'verified_at'
  | 'eligibility_verified'
  | 'administrator'
  | 'eligibility_text'
>;

export function catalogCardProof(
  lawsuit: ProofFields,
  hide = hideUnknownCatalogFields(),
): string | null {
  const status: ProofRequired = displayProofStatus(lawsuit);
  if (hide && status === 'unknown') return null;
  return displayProofLabel(lawsuit);
}

export function catalogCardPayout(
  raw: string | null | undefined,
  hide = hideUnknownCatalogFields(),
): string | null {
  const trimmed = raw?.trim() || null;
  if (hide) return trimmed;
  return trimmed || 'Not stated';
}

export function catalogCardDeadlineLabel(
  deadline: string | null | undefined,
  formatted: string | null,
  hide = hideUnknownCatalogFields(),
): string | null {
  if (hide && !deadline) return null;
  if (formatted) return formatted;
  return hide ? null : 'No deadline listed';
}

/** Labels for the honest missing-details line on a catalog card. */
export function catalogCardMissing(
  lawsuit: {
    deadline?: string | null;
    typical_payout?: string | null;
  } & ProofFields,
  hide = hideUnknownCatalogFields(),
): string[] {
  if (!hide) return [];
  const missing: string[] = [];
  if (!lawsuit.deadline) missing.push('deadline');
  if (displayProofStatus(lawsuit) === 'unknown') missing.push('proof');
  if (!lawsuit.typical_payout?.trim()) missing.push('listed payout');
  return missing;
}
