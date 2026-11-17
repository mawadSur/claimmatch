/**
 * "You might be owed" header on the signed-in matches dashboard.
 * Sums each open match's listed payout_min / payout_max from that
 * settlement's own record. Never parses typical_payout text, never uses
 * user-reported recoveries, and never invents a number.
 *
 * Hidden unless at least one match has a stated numeric payout.
 * UI gates on OWED_ESTIMATE_HEADER_ENABLED.
 */

export interface MatchPayoutTerms {
  payoutMin?: number | string | null;
  payoutMax?: number | string | null;
}

export interface StatedPayoutRange {
  low: number;
  high: number;
}

export interface OwedEstimate {
  /** Matches whose settlement record has a numeric payout_min and/or payout_max. */
  statedCount: number;
  /** Open matches with no numeric payout on the settlement record. */
  unstatedCount: number;
  /** Sum of each stated match's low figure. */
  low: number;
  /** Sum of each stated match's high figure. */
  high: number;
}

export const OWED_ESTIMATE_ASSUMPTION =
  'This estimate adds each open match’s listed payout range from that settlement’s own record. It is not a prediction of what you will receive.';

/** A finite number from a stored payout_min / payout_max. Strings come from numeric columns. */
export function finitePayoutAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * One settlement's listed range. Missing one side uses the other as a point
 * figure. Neither side → excluded (not a stated amount).
 */
export function statedPayoutRange(terms: MatchPayoutTerms): StatedPayoutRange | null {
  const min = finitePayoutAmount(terms.payoutMin);
  const max = finitePayoutAmount(terms.payoutMax);
  if (min == null && max == null) return null;
  if (min != null && max != null) return { low: min, high: max };
  const n = min ?? max;
  if (n == null) return null;
  return { low: n, high: n };
}

export function buildOwedEstimate(matches: readonly MatchPayoutTerms[]): OwedEstimate {
  let statedCount = 0;
  let unstatedCount = 0;
  let low = 0;
  let high = 0;
  for (const match of matches) {
    const range = statedPayoutRange(match);
    if (!range) {
      unstatedCount += 1;
      continue;
    }
    statedCount += 1;
    low += range.low;
    high += range.high;
  }
  return { statedCount, unstatedCount, low, high };
}

/**
 * Null when the header must stay hidden: fewer than one match has a stated
 * amount. Callers still pass the full open-match list so unstated rows count.
 */
export function visibleOwedEstimate(matches: readonly MatchPayoutTerms[]): OwedEstimate | null {
  const estimate = buildOwedEstimate(matches);
  if (estimate.statedCount < 1) return null;
  return estimate;
}

export function formatOwedUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function owedRangeLabel(estimate: OwedEstimate): string {
  const low = formatOwedUsd(estimate.low);
  const high = formatOwedUsd(estimate.high);
  if (low === high) return low;
  return `${low}–${high}`;
}

export function unstatedPayoutCopy(count: number): string | null {
  if (count < 1) return null;
  if (count === 1) return '1 claim has no payout amount announced';
  return `${count} claims have no payout amount announced`;
}
