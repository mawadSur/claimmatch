import { rankablePayout, type PayoutColumns } from './top-payouts';
import type { Lawsuit } from './types';

/** Payout figures for rows the homepage has already loaded. Counts of open rows and deadlines belong to homeStats. */
export interface PayoutStats {
  /** How many rows state a per-person payout in their displayed text. */
  withStatedPayout: number;
  /**
   * Median of the qualifying payouts, or null when none qualify. Report it
   * beside `withStatedPayout`, not the full open count. With an even count,
   * use the lower middle value rather than inventing an average.
   */
  medianPayout: number | null;
  /** The highest qualifying payout and the listing it came from, or null. */
  topPayout: TopPayout | null;
}

export interface TopPayout {
  amount: number;
  slug: string;
  title: string;
}

export type PayoutStatsRow = Pick<Lawsuit, 'slug' | 'title'> & PayoutColumns;

/** The lower of the two middle values on an even count, so the figure is a real one. */
function medianOf(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function payoutStats(rows: readonly PayoutStatsRow[]): PayoutStats {
  const amounts: number[] = [];
  let topPayout: TopPayout | null = null;

  for (const row of rows) {
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
    withStatedPayout: amounts.length,
    medianPayout: medianOf(amounts),
    topPayout,
  };
}
