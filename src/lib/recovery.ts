import type { Lawsuit } from './types';

/** Anything carrying an optional joined lawsuit (Match or Claim). */
interface MatchLike {
  lawsuit?: Lawsuit;
}

/**
 * ClaimMatch business model: FREE to users. We match people to open settlements
 * and pre-fill the official claim forms; the user reviews and submits on the
 * settlement administrator's own site. We NEVER take a percentage of a recovery —
 * our revenue comes from referral / lead fees on partner services the user
 * chooses to use, not from the user's money.
 *
 * FEE_PCT is retained only as a hard `0` so the money math (and any pages not yet
 * migrated) share one source of truth for "our cut": there is none. Recoveries
 * are tracked so a member can see what they've recovered — net always equals gross.
 */
export const FEE_PCT = 0;

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
 * Pull an honest number out of a free-text payout string like "$25–$100",
 * "Up to $500", or "$40". Averages the low/high dollar figures it finds; returns
 * null when the string carries no usable number (so we never invent a value).
 */
function parsePayoutString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const nums = (raw.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return round2((lo + hi) / 2);
}

/**
 * Honest midpoint per-claimant value estimate for one lawsuit. Prefers the
 * structured numeric range (LLM estimate, then payout_min/max), then falls back
 * to parsing the free-text typical_payout. Returns null when we genuinely don't
 * know — callers MUST render that as "amount varies", never as $0 or a fabricated
 * figure. (This deliberately replaces the old hardcoded `return 50` fallback.)
 */
export function estimateLawsuitValue(
  l: Pick<
    Lawsuit,
    | 'estimated_value_min'
    | 'estimated_value_max'
    | 'payout_min'
    | 'payout_max'
    | 'typical_payout'
  >,
): number | null {
  const lo = l.estimated_value_min ?? l.payout_min ?? null;
  const hi = l.estimated_value_max ?? l.payout_max ?? null;
  if (lo != null && hi != null) return round2((lo + hi) / 2);
  if (hi != null) return round2(hi);
  if (lo != null) return round2(lo);
  return parsePayoutString(l.typical_payout);
}

/**
 * Total gross a user could be owed across a set of matched lawsuits. Sums only
 * the lawsuits we can actually estimate; unknowns contribute nothing rather than
 * a made-up value.
 */
export function estimateTotalOwed(matches: MatchLike[]): number {
  return round2(
    matches.reduce((sum, m) => {
      const est = m.lawsuit ? estimateLawsuitValue(m.lawsuit) : null;
      return sum + (est ?? 0);
    }, 0),
  );
}
