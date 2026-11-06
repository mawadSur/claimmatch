import { eligibilitySummary } from '@/lib/claim-input';
import { flags } from '@/lib/flags';
import { cleanSearchTerm, searchCatalog } from '@/lib/lawsuits';
import { proofStatus } from '@/lib/proof';
import { displayProofStatus } from '@/lib/verified-fields';
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

/** C17 home entry: only "no" is a supported proof filter. */
export function parseProofFilter(raw: string | null | undefined): 'no' | undefined {
  return raw?.trim().toLowerCase() === 'no' ? 'no' : undefined;
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

const PROOF_RANK = { no: 0, optional: 1, yes: 2, unknown: 3 } as const;

type ValueRankRow = Pick<Lawsuit, 'deadline'> &
  Partial<Pick<Lawsuit, 'proof_required' | 'eligibility' | 'payout_min' | 'payout_max' | 'typical_payout'>>;

/** Highest listed dollar amount, or null when the catalog has no number. Never invents. */
export function listedPayoutAmount(
  row: Partial<Pick<Lawsuit, 'payout_min' | 'payout_max' | 'typical_payout'>>,
): number | null {
  if (typeof row.payout_max === 'number' && Number.isFinite(row.payout_max)) return row.payout_max;
  if (typeof row.payout_min === 'number' && Number.isFinite(row.payout_min)) return row.payout_min;
  const text = row.typical_payout?.trim();
  if (!text) return null;
  const nums = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/**
 * No-proof first, then higher listed payout, then sooner deadline.
 * Unknown proof and missing payouts sort after known values.
 */
export function sortCatalogValueFirst<T extends ValueRankRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const proofA = PROOF_RANK[proofStatus({ proof_required: a.proof_required ?? false, eligibility: a.eligibility ?? {} })];
    const proofB = PROOF_RANK[proofStatus({ proof_required: b.proof_required ?? false, eligibility: b.eligibility ?? {} })];
    if (proofA !== proofB) return proofA - proofB;
    const payA = listedPayoutAmount(a);
    const payB = listedPayoutAmount(b);
    if (payA != null && payB != null && payA !== payB) return payB - payA;
    if (payA != null && payB == null) return -1;
    if (payA == null && payB != null) return 1;
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
export function filterCatalog<
  T extends Pick<Lawsuit, 'title' | 'summary' | 'category' | 'deadline'> &
    Partial<Pick<Lawsuit, 'proof_required' | 'eligibility' | 'proof_verified' | 'verified_at' | 'eligibility_verified' | 'administrator' | 'eligibility_text' | 'payout_min' | 'payout_max' | 'typical_payout'>>,
>(
  lawsuits: T[],
  opts: { q?: string; category?: string; hasDeadline?: boolean; proof?: 'no' },
): T[] {
  let rows = searchCatalog(lawsuits, { q: cleanSearchTerm(opts.q), category: opts.category });
  if (opts.hasDeadline) rows = rows.filter((l) => Boolean(l.deadline));
  if (opts.proof === 'no') {
    rows = rows.filter((l) => displayProofStatus({
      proof_required: l.proof_required ?? false,
      eligibility: l.eligibility ?? {},
      proof_verified: l.proof_verified,
      verified_at: l.verified_at,
      eligibility_verified: l.eligibility_verified,
      administrator: l.administrator ?? null,
      eligibility_text: l.eligibility_text ?? null,
    }) === 'no');
  }
  if (flags.catalogValueRank()) return sortCatalogValueFirst(rows);
  return sortKnownDeadlineFirst(rows);
}

export function catalogQueryString(opts: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  proof?: 'no';
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.category) params.set('category', opts.category);
  if (opts.hasDeadline) params.set('hasDeadline', '1');
  if (opts.proof === 'no') params.set('proof', 'no');
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  return params.toString();
}

/** Path for a catalog page. Page 1 drops the page param (canonical target). */
export function catalogPath(opts: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  proof?: 'no';
  page?: number;
}): string {
  const qs = catalogQueryString(opts);
  return qs ? `/lawsuits?${qs}` : '/lawsuits';
}

/**
 * When pagination is off, every open row is one page (existing behavior).
 * When it is on, slice 24 at a time.
 */
export function paginateCatalog<T>(
  items: T[],
  page: number,
  enabled: boolean,
  pageSize: number = LAWSUITS_PAGE_SIZE,
): Paginated<T> {
  if (!enabled) {
    return {
      items,
      page: 1,
      pageSize: items.length || pageSize,
      total: items.length,
      totalPages: 1,
    };
  }
  return paginate(items, page, pageSize);
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
