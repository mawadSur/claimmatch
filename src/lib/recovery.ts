import type { Lawsuit } from './types';

/** Anything carrying an optional joined lawsuit (Match or Claim). */
interface MatchLike {
  lawsuit?: Lawsuit;
}

/**
 * ClaimMatch business model: "we recover it for you and take a %".
 * Central place for the contingency fee rate + all money math so the UI and the
 * accounting agree. Fee defaults to 15% and is overridable via env.
 */
export const FEE_PCT = (() => {
  const v = Number(process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_PCT);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.15;
})();

export function feeAmount(gross: number): number {
  return round2(gross * FEE_PCT);
}
export function netAmount(gross: number): number {
  return round2(gross * (1 - FEE_PCT));
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUSD(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '$0';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Midpoint per-claimant value estimate for one lawsuit. Uses the LLM-estimated
 * range when present, else parses payout_min/max, else a conservative default.
 */
export function estimateLawsuitValue(l: Pick<Lawsuit,
  'estimated_value_min' | 'estimated_value_max' | 'payout_min' | 'payout_max'>): number {
  const lo = l.estimated_value_min ?? l.payout_min ?? null;
  const hi = l.estimated_value_max ?? l.payout_max ?? null;
  if (lo != null && hi != null) return round2((lo + hi) / 2);
  if (hi != null) return round2(hi);
  if (lo != null) return round2(lo);
  return 50; // conservative fallback so "you're owed" is never $0 with matches
}

/** Total gross a user could be owed across a set of matched lawsuits. */
export function estimateTotalOwed(matches: MatchLike[]): number {
  return round2(
    matches.reduce((sum, m) => sum + (m.lawsuit ? estimateLawsuitValue(m.lawsuit) : 0), 0),
  );
}
