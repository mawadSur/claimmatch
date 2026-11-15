import type { Lawsuit } from './types';

type TopPayoutRow = Pick<Lawsuit, 'id' | 'title' | 'deadline'> &
  Partial<Pick<Lawsuit, 'typical_payout'>>;

// "$1,200", "$ 25.50"; not "$5 million" / "$2.3B" (fund totals, not per-person payouts).
const DOLLAR = /\$\s*([\d,]+(?:\.\d+)?)(\s*(?:million|billion|mil|bn|[mb])\b)?/gi;

/**
 * Largest per-person dollar amount written in the payout text the card shows.
 * Only "$"-prefixed numbers count, so years, months and quantities never do,
 * and fund totals ("$5 million settlement") are skipped. Null when none.
 */
export function statedDollarPayout(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = [...text.matchAll(DOLLAR)]
    .filter((m) => m[2] === undefined) // skip "$5 million" style fund totals
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Choose the rows for the home page's "Top open settlements" module:
 * rows whose displayed payout text states a dollar amount, highest first,
 * then sooner deadline, then title. Ranking uses the same text the card
 * shows, so the order always matches what the visitor reads. Rows with no
 * dollar amount are left out, never guessed.
 *
 * This only orders and trims. Whether a settlement is open for claims is the
 * shared catalog rule applied by lookupLawsuits(); this function never decides it.
 */
export function pickTopPayouts<T extends TopPayoutRow>(rows: readonly T[], limit = 5): T[] {
  return rows
    .map((row) => ({ row, amount: statedDollarPayout(row.typical_payout) }))
    .filter((entry): entry is { row: T; amount: number } => entry.amount != null)
    .sort((a, b) => {
      if (a.amount !== b.amount) return b.amount - a.amount;
      if (a.row.deadline && b.row.deadline && a.row.deadline !== b.row.deadline) {
        return a.row.deadline.localeCompare(b.row.deadline);
      }
      if (a.row.deadline && !b.row.deadline) return -1;
      if (!a.row.deadline && b.row.deadline) return 1;
      return a.row.title.localeCompare(b.row.title);
    })
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((entry) => entry.row);
}
