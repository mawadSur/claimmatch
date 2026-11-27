import { CLOSING_SOON_DAYS } from './home-stats';
import { rankablePayout, type PayoutColumns } from './top-payouts';
import type { Lawsuit } from './types';
import { daysLeftToFile } from './utils';

/**
 * The live payout picture for the open catalog, counted from the rows the home
 * page has already loaded. Every figure is derived from real listings at render
 * time: nothing is averaged across the whole catalog, rounded up, cached or
 * hardcoded. A figure that cannot be computed comes back null, never zero and
 * never a guess, so a surface can hide itself instead of printing a fiction.
 *
 * Pure: no I/O, no env reads, no clock of its own beyond the `now` passed in.
 */
export interface PayoutStats {
  /** Open settlements counted. An exact count of the rows passed in. */
  open: number;
  /** Of those, how many state a per-person payout figure of their own. */
  withStatedPayout: number;
  /**
   * Median of those stated per-person payouts, or null when none state one.
   * Only ever meaningful beside `withStatedPayout`, never beside `open`:
   * With an even count this is the lower of the two middle figures, so the
   * number is always one a real listing states rather than an average of two.
   */
  medianPayout: number | null;
  /** The largest stated per-person payout, with the listing it came from, or null. */
  topPayout: TopPayout | null;
  /** Of the rows passed in, how many have a real deadline inside the window. */
  closingSoon: number;
}

export interface TopPayout {
  amount: number;
  slug: string;
  title: string;
}

export type PayoutStatsRow = Pick<Lawsuit, 'slug' | 'title'> &
  Partial<Pick<Lawsuit, 'deadline'>> &
  PayoutColumns;

/** The lower of the two middle values on an even count, so the figure is a real one. */
function medianOf(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function payoutStats(
  rows: readonly PayoutStatsRow[],
  now: Date = new Date(),
  withinDays: number = CLOSING_SOON_DAYS,
): PayoutStats {
  const amounts: number[] = [];
  let topPayout: TopPayout | null = null;
  let closingSoon = 0;

  for (const row of rows) {
    const days = daysLeftToFile(row.deadline, now);
    if (days !== null && days <= withinDays) closingSoon += 1;

    // rankablePayout, not perPersonPayout: a curated payout_max column on a
    // listing whose own payout text states no per-person amount must never
    // become the hero's headline figure. That is the audited symptom this
    // change exists to remove, and attributing it to a named, linked listing
    // would make it worse than it was in the module.
    const amount = rankablePayout(row);
    if (amount == null) continue;
    amounts.push(amount);
    // Ties keep the first listing seen, so the attribution is stable per load.
    if (!topPayout || amount > topPayout.amount) {
      topPayout = { amount, slug: row.slug, title: row.title };
    }
  }

  amounts.sort((a, b) => a - b);

  return {
    open: rows.length,
    withStatedPayout: amounts.length,
    medianPayout: medianOf(amounts),
    topPayout,
    closingSoon,
  };
}
