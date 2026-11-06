/**
 * Shared public copy. Keep fee and filing language in one place so home,
 * pricing and tests cannot drift.
 */

import { flags } from '@/lib/flags';

/** Official-administrator filing has no filing charge. Not a ClaimMatch price. */
export const OFFICIAL_FILING_IS_FREE = 'Filing on the official site is always free.';

/** @deprecated Use OFFICIAL_FILING_IS_FREE. Kept so existing imports stay valid. */
export const FILING_FREE_WARNING = OFFICIAL_FILING_IS_FREE;

/**
 * Recovery share, in percent. Owner decision: ClaimMatch files the claim and
 * charges this share only if the user is paid. Public pages show this only
 * when FEE_DISCLOSURE_ENABLED=1.
 */
export const CLAIMMATCH_FEE_RATE = 15;

export function feeEveryClaimCopy(rate = CLAIMMATCH_FEE_RATE): string {
  return (
    `ClaimMatch files the claim for you and charges ${rate} percent only if you get paid. ` +
    'The settlement administrator pays you directly.'
  );
}

/** Primary match CTA when ASSISTED_FILING_ENABLED=1. */
export const FILE_FOR_YOU_CTA = 'We’ll file it for you';

/** Secondary self-file link next to the primary filing CTA. */
export const SELF_FILE_SECONDARY = 'Copy details and file yourself';

export const BETA_FEE_COPY =
  'ClaimMatch is free during beta. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.';

/** Softened beta line. Shown only when PANEL_TRUST_COPY_ENABLED=1 (counsel review). */
export const NEUTRAL_BETA_FEE_COPY =
  'Free during beta. Any future pricing will be shown before you use it.';

export const BROWSE_NO_ACCOUNT =
  'Browsing listings and opening the official claim form need no account.';

export const ACCOUNT_FOR_SAVE_WHY =
  'Create an account only to save matches or get deadline alerts.';

export const WHAT_WE_STORE_MINIMAL =
  'We store your name and email so you can sign in. After onboarding we store the state and answers you give so we can match settlements. No phone. Street address only if a claim form needs it.';

/** Public cost line. Beta wording until counsel flips FEE_DISCLOSURE_ENABLED. */
export function publicCostNote(disclose: boolean): string {
  return disclose ? feeEveryClaimCopy() : `${OFFICIAL_FILING_IS_FREE} ${publicBetaFeeCopy()}`;
}

/** Live beta fee sentence. Neutral wording is behind PANEL_TRUST_COPY_ENABLED. */
export function publicBetaFeeCopy(neutral = flags.panelTrustCopy()): string {
  return neutral ? NEUTRAL_BETA_FEE_COPY : BETA_FEE_COPY;
}
