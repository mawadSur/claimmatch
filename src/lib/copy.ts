/**
 * Shared public copy. Keep fee and filing language in one place so home,
 * pricing and tests cannot drift.
 */

/** Official-administrator filing has no filing charge. Not a ClaimMatch price. */
export const OFFICIAL_FILING_IS_FREE = 'Filing on the official site is always free.';

/** @deprecated Use OFFICIAL_FILING_IS_FREE. Kept so existing imports stay valid. */
export const FILING_FREE_WARNING = OFFICIAL_FILING_IS_FREE;

/**
 * Recovery share, in percent. Owner decision: applies to every claim made
 * through ClaimMatch, not only assisted filings. Public pages show this only
 * when FEE_DISCLOSURE_ENABLED=1.
 */
export const CLAIMMATCH_FEE_RATE = 15;

export function feeEveryClaimCopy(rate = CLAIMMATCH_FEE_RATE): string {
  return (
    `ClaimMatch’s fee is ${rate} percent of what you receive on every claim you make through ClaimMatch, not only assisted filings. ` +
    'The settlement administrator pays you directly. Official filing on the administrator’s site stays free.'
  );
}

export const BETA_FEE_COPY =
  'ClaimMatch is free during beta. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.';

/** Public cost line. Beta wording until counsel flips FEE_DISCLOSURE_ENABLED. */
export function publicCostNote(disclose: boolean): string {
  return disclose ? feeEveryClaimCopy() : `${OFFICIAL_FILING_IS_FREE} ${BETA_FEE_COPY}`;
}
