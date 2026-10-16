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
