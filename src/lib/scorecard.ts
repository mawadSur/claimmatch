/**
 * Public trust scorecard: measured counts only. Empty until a stat has at
 * least SCORECARD_MIN_POINTS non-internal data points. Never pads, estimates,
 * or invents a number.
 */
import { formatCount } from './home-stats';

export const SCORECARD_MIN_POINTS = 5;

export type ScorecardStat =
  | { ready: true; count: number; display: string }
  | { ready: false; count: 0; display: null };

export interface ScorecardStats {
  openSettlements: ScorecardStat;
  claimsFiled: ScorecardStat;
  payoutsReported: ScorecardStat;
  payoutTotal: ScorecardStat;
}

export interface ScorecardInputs {
  openSettlementCount: number;
  filedClaimCount: number;
  payoutCount: number;
  payoutTotalAmount: number;
}

export function scorecardStat(dataPoints: number, min = SCORECARD_MIN_POINTS): ScorecardStat {
  const n = Number.isFinite(dataPoints) ? Math.max(0, Math.floor(dataPoints)) : 0;
  if (n < min) return { ready: false, count: 0, display: null };
  return { ready: true, count: n, display: formatCount(n) };
}

/** Same 5-point gate as counts. Amount is shown only when payout rows qualify. */
export function scorecardAmountStat(
  dataPoints: number,
  total: number,
  min = SCORECARD_MIN_POINTS,
): ScorecardStat {
  const n = Number.isFinite(dataPoints) ? Math.max(0, Math.floor(dataPoints)) : 0;
  if (n < min) return { ready: false, count: 0, display: null };
  const amount = Number.isFinite(total) ? Math.max(0, total) : 0;
  return { ready: true, count: n, display: formatUsd(amount) };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount)));
}

export function isInternalUserId(
  userId: string | null | undefined,
  internalIds: ReadonlySet<string>,
): boolean {
  if (!userId) return true;
  return internalIds.has(userId);
}

export function countExcludingInternal(
  rows: ReadonlyArray<{ user_id?: string | null }>,
  internalIds: ReadonlySet<string>,
): number {
  let n = 0;
  for (const row of rows) {
    if (isInternalUserId(row.user_id, internalIds)) continue;
    n += 1;
  }
  return n;
}

export function sumPayoutsExcludingInternal(
  rows: ReadonlyArray<{ user_id?: string | null; gross_amount?: number | string | null }>,
  internalIds: ReadonlySet<string>,
): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const row of rows) {
    if (isInternalUserId(row.user_id, internalIds)) continue;
    count += 1;
    const amount = typeof row.gross_amount === 'number' ? row.gross_amount : Number(row.gross_amount);
    if (Number.isFinite(amount) && amount > 0) total += amount;
  }
  return { count, total };
}

export function buildScorecard(input: ScorecardInputs, min = SCORECARD_MIN_POINTS): ScorecardStats {
  return {
    openSettlements: scorecardStat(input.openSettlementCount, min),
    claimsFiled: scorecardStat(input.filedClaimCount, min),
    payoutsReported: scorecardStat(input.payoutCount, min),
    payoutTotal: scorecardAmountStat(input.payoutCount, input.payoutTotalAmount, min),
  };
}

export const SCORECARD_EMPTY_COPY =
  'Not enough public data yet. We only show a number once at least 5 records from people who are not testers are on file.';
