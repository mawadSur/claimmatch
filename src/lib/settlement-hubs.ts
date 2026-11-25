import { pickClosingSoon } from '@/lib/closing-soon';
import { proofStatus } from '@/lib/proof';
import type { Lawsuit } from '@/lib/types';
import { todayInDeadlineZone } from '@/lib/utils';

/** Open settlements with a deadline, soonest first. Does not decide open/closed. */
export function hubClosingSoon(rows: readonly Lawsuit[], limit?: number): Lawsuit[] {
  return pickClosingSoon(rows, limit ?? rows.length);
}

/**
 * Open settlements whose listed deadline falls in the current calendar month
 * (America/New_York), still open today. Never invents a date.
 */
export function hubClosingThisMonth(
  rows: readonly Lawsuit[],
  now: Date = new Date(),
): Lawsuit[] {
  const today = todayInDeadlineZone(now);
  const month = today.slice(0, 7);
  return hubClosingSoon(rows).filter((row) => {
    const deadline = row.deadline?.slice(0, 10);
    return Boolean(deadline && deadline.startsWith(month) && deadline >= today);
  });
}

/**
 * Open settlements the catalog marks as no proof required. Unknown and
 * optional proof stay off this list — never treated as "no".
 */
export function hubNoProofRequired(rows: readonly Lawsuit[]): Lawsuit[] {
  return hubClosingSoon(rows).filter((row) => proofStatus(row) === 'no');
}

/** Open settlements, newest listing first (created_at). Does not invent dates. */
export function hubNewest(rows: readonly Lawsuit[], limit?: number): Lawsuit[] {
  const sorted = [...rows].sort((a, b) => {
    const cmp = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (Number.isFinite(cmp) && cmp !== 0) return cmp;
    return a.title.localeCompare(b.title);
  });
  return typeof limit === 'number' ? sorted.slice(0, Math.max(0, Math.floor(limit))) : sorted;
}

/** Newest updated_at among rows, for sitemap lastmod. */
export function newestUpdatedAt(rows: readonly Pick<Lawsuit, 'updated_at'>[]): Date | null {
  let latest = 0;
  for (const row of rows) {
    const at = Date.parse(row.updated_at);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest > 0 ? new Date(latest) : null;
}
