import { eligibilitySummary } from '@/lib/claim-input';
import { cleanSearchTerm, searchCatalog } from '@/lib/lawsuits';
import type { Lawsuit } from '@/lib/types';

/** Cards per page on /lawsuits. Keep HTML small enough to cache. */
export const LAWSUITS_PAGE_SIZE = 24;

export interface CatalogPageQuery {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  page?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Page number from a query string: integers ≥ 1, otherwise 1. */
export function parsePage(raw: string | null | undefined): number {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function parseHasDeadline(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Known-deadline rows first (soonest first), then rows with no deadline.
 * Does not change which rows count as open.
 */
export function sortKnownDeadlineFirst<T extends Pick<Lawsuit, 'deadline'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number = LAWSUITS_PAGE_SIZE,
): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

/**
 * Search, optional "Has a deadline" filter, then deadline-first sort.
 * Open-for-claims membership is decided before this runs.
 */
export function filterCatalog<T extends Pick<Lawsuit, 'title' | 'summary' | 'category' | 'deadline'>>(
  lawsuits: T[],
  opts: { q?: string; category?: string; hasDeadline?: boolean },
): T[] {
  let rows = searchCatalog(lawsuits, { q: cleanSearchTerm(opts.q), category: opts.category });
  if (opts.hasDeadline) rows = rows.filter((l) => Boolean(l.deadline));
  return sortKnownDeadlineFirst(rows);
}

export function catalogQueryString(opts: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.category) params.set('category', opts.category);
  if (opts.hasDeadline) params.set('hasDeadline', '1');
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  return params.toString();
}

/** A listing is thin when it has none of the facts a visitor comes for. */
export function isThinSettlement(
  lawsuit: Pick<Lawsuit, 'deadline' | 'eligibility_text' | 'administrator' | 'typical_payout'>,
): boolean {
  return (
    !lawsuit.deadline &&
    !eligibilitySummary(lawsuit.eligibility_text) &&
    !lawsuit.administrator?.trim() &&
    !lawsuit.typical_payout?.trim()
  );
}
