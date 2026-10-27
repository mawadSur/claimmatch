import { isPublicLawsuit } from './open-for-claims';
import type { Lawsuit } from './types';
import { isDeadlinePassed } from './utils';

/** Rows closed or past deadline in this many days belong on the archive. */
export const RECENTLY_CLOSED_DAYS = 90;

export const RECENTLY_CLOSED_PATH = '/settlements/recently-closed';

export const CLOSED_ARCHIVE_LABEL =
  'Closed. Do not file unless the official site still accepts claims';

function eventTimeMs(row: Pick<Lawsuit, 'closed_at' | 'deadline'>): number | null {
  const closedAt = row.closed_at ? Date.parse(row.closed_at) : Number.NaN;
  if (Number.isFinite(closedAt)) return closedAt;
  const deadline = row.deadline ? Date.parse(row.deadline) : Number.NaN;
  if (Number.isFinite(deadline)) return deadline;
  return null;
}

/** Published listing that is closed or past its deadline. */
export function isClosedListing(
  row: Pick<Lawsuit, 'slug' | 'status' | 'review_status' | 'deadline'>,
  now: Date = new Date(),
): boolean {
  if (!isPublicLawsuit(row)) return false;
  if (row.status === 'closed') return true;
  return isDeadlinePassed(row.deadline, now);
}

/**
 * Closed (or past-deadline) published rows whose close/deadline event falls
 * inside the last 90 days. No claim-rate numbers.
 */
export function recentlyClosed<
  T extends Pick<Lawsuit, 'slug' | 'status' | 'review_status' | 'deadline' | 'closed_at' | 'title'>,
>(rows: readonly T[], now: Date = new Date()): T[] {
  const cutoff = now.getTime() - RECENTLY_CLOSED_DAYS * 24 * 60 * 60 * 1000;
  return rows
    .filter((row) => {
      if (!isClosedListing(row, now)) return false;
      const at = eventTimeMs(row);
      return at !== null && at >= cutoff && at <= now.getTime();
    })
    .sort((a, b) => {
      const aAt = eventTimeMs(a) ?? 0;
      const bAt = eventTimeMs(b) ?? 0;
      return bAt - aAt || a.title.localeCompare(b.title);
    });
}
