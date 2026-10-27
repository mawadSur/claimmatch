import { daysLeftToFile } from './utils';

/**
 * Choose the rows for the home page's "Closing soon" module: rows that have a
 * deadline, soonest first.
 *
 * This only orders and trims. Whether a settlement is open for claims is the
 * shared catalog rule applied by getLawsuits(); this function never decides it.
 */
export function pickClosingSoon<T extends { deadline: string | null; title: string }>(
  rows: readonly T[],
  limit = 3,
): T[] {
  return rows
    .map((row) => ({ row, at: row.deadline ? Date.parse(row.deadline) : Number.NaN }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at || a.row.title.localeCompare(b.row.title))
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((entry) => entry.row);
}

/**
 * C11 chip for a real future deadline. Null when there is no date or it has
 * already passed — never invents a countdown.
 */
export function closesInChip(
  deadline: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const days = daysLeftToFile(deadline, now);
  if (days === null) return null;
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes in 1 day';
  return `Closes in ${days} days`;
}
