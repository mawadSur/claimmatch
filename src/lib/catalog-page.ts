import { eligibilitySummary } from './claim-input';
import { noPinBreachRank } from './claim-priority';
import { flags } from './flags';
import { cleanSearchTerm, searchCatalog } from './lawsuit-display';
import { proofStatus } from './proof';
import { perPersonPayout, type PayoutColumns } from './top-payouts';
import { displayProofStatus } from './verified-fields';
import type { Lawsuit } from './types';

/** Cards per page on /lawsuits. Keep HTML small enough to cache. */
export const LAWSUITS_PAGE_SIZE = 12;

export interface CatalogPageQuery {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  page?: number;
  fileForYou?: boolean;
  openingSoon?: boolean;
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

/** Catalog Easy submit filter (`?fileForYou=1`). */
export function parseFileForYou(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Catalog Opening soon filter (`?openingSoon=1`) — `not_open` rows. */
export function parseOpeningSoon(raw: string | null | undefined): boolean {
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

const PROOF_RANK = { no: 0, optional: 1, yes: 2, unknown: 3 } as const;

type ValueRankRow = Pick<Lawsuit, 'deadline'> &
  Partial<Pick<Lawsuit, 'proof_required' | 'eligibility'>> & PayoutColumns;

/**
 * No-proof first, then higher per-person payout, then sooner deadline.
 * Within a proof tier, unknown payouts sort after known payouts. Unlike the
 * homepage's featured payouts, catalog ranking accepts curated columns alone.
 */
export function sortCatalogValueFirst<T extends ValueRankRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const proofA = PROOF_RANK[proofStatus({ proof_required: a.proof_required ?? false, eligibility: a.eligibility ?? {} })];
    const proofB = PROOF_RANK[proofStatus({ proof_required: b.proof_required ?? false, eligibility: b.eligibility ?? {} })];
    if (proofA !== proofB) return proofA - proofB;
    const payA = perPersonPayout(a);
    const payB = perPersonPayout(b);
    if (payA != null && payB != null && payA !== payB) return payB - payA;
    if (payA != null && payB == null) return -1;
    if (payA == null && payB != null) return 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

type NoPinRankRow = Pick<Lawsuit, 'deadline'> &
  Partial<Pick<Lawsuit, 'claim_action_type' | 'category' | 'title' | 'summary'>>;

/**
 * NO_PIN_BREACH_PRIORITY_ENABLED: settlements whose official path needs no
 * mailed notice ID first (breach classes first of all), then the default
 * known-deadline order. Ordering only: no card copy asserts that a settlement
 * needs no ID, because some audited desk_file paths still ask for one.
 *
 * A row with no known claim_action_type ranks last in the no-PIN key, so this
 * degrades to sortKnownDeadlineFirst before migration 0051 is applied.
 */
export function sortNoPinBreachFirst<T extends NoPinRankRow>(rows: T[]): T[] {
  return sortKnownDeadlineFirst(rows).sort(
    (a, b) =>
      noPinBreachRank({
        claim_action_type: a.claim_action_type,
        category: a.category,
        title: a.title,
        summary: a.summary,
      }) -
      noPinBreachRank({
        claim_action_type: b.claim_action_type,
        category: b.category,
        title: b.title,
        summary: b.summary,
      }),
  );
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
    Partial<Pick<Lawsuit, 'proof_required' | 'eligibility' | 'proof_verified' | 'verified_at' | 'eligibility_verified' | 'administrator' | 'eligibility_text' | 'payout_min' | 'payout_max' | 'typical_payout' | 'claim_action_type'>>,
>(
  lawsuits: T[],
  opts: {
    q?: string;
    category?: string;
    hasDeadline?: boolean;
    proof?: 'no';
    fileForYou?: boolean;
    fileForYouIds?: ReadonlySet<string>;
  },
): T[] {
  let rows = searchCatalog(lawsuits, { q: cleanSearchTerm(opts.q), category: opts.category });
  if (opts.hasDeadline) rows = rows.filter((l) => Boolean(l.deadline));
  if (opts.fileForYou && opts.fileForYouIds) {
    rows = rows.filter((l) => 'id' in l && opts.fileForYouIds!.has(String((l as { id: string }).id)));
  }
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
  // Precedence when both ordering flags are on: no-PIN breach wins, because it
  // is about whether a person can finish the claim at all.
  if (flags.noPinBreachPriority()) return sortNoPinBreachFirst(rows);
  if (flags.catalogValueRank()) return sortCatalogValueFirst(rows);
  return sortKnownDeadlineFirst(rows);
}

export function catalogQueryString(opts: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  proof?: 'no';
  fileForYou?: boolean;
  openingSoon?: boolean;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.category) params.set('category', opts.category);
  if (opts.hasDeadline) params.set('hasDeadline', '1');
  if (opts.proof === 'no') params.set('proof', 'no');
  if (opts.fileForYou) params.set('fileForYou', '1');
  if (opts.openingSoon) params.set('openingSoon', '1');
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  return params.toString();
}

/** Hub path with an optional page param. Page 1 drops the query. */
export function paginatedPath(base: string, page?: number): string {
  if (!page || page <= 1) return base;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}page=${page}`;
}

/** Path for a catalog page. Page 1 drops the page param (canonical target). */
export function catalogPath(opts: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  proof?: 'no';
  fileForYou?: boolean;
  openingSoon?: boolean;
  page?: number;
}): string {
  const qs = catalogQueryString(opts);
  return qs ? `/lawsuits?${qs}` : '/lawsuits';
}

/**
 * Slice a catalog list. Public /lawsuits and /settlements/new always paginate;
 * pass enabled=false only in tests that cover the legacy one-page HTML.
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

/**
 * Feed placeholders that are not a payout ("Varies" is the scraper default
 * when a source lists no amount). Used only to decide thinness; the page still
 * shows the listed text.
 */
const PLACEHOLDER_PAYOUT = /^(varies|tbd|tba|unknown|not stated|not listed|n\/?a|none|see (the )?(official )?(notice|site|website))\.?$/i;

export function isPlaceholderPayout(payout: string | null | undefined): boolean {
  const t = payout?.trim() ?? '';
  return t === '' || PLACEHOLDER_PAYOUT.test(t);
}

/** A listing is thin when it has none of the facts a visitor comes for. */
export function isThinSettlement(
  lawsuit: Pick<Lawsuit, 'deadline' | 'eligibility_text' | 'administrator' | 'typical_payout'>,
): boolean {
  return (
    !lawsuit.deadline &&
    !eligibilitySummary(lawsuit.eligibility_text) &&
    !lawsuit.administrator?.trim() &&
    isPlaceholderPayout(lawsuit.typical_payout)
  );
}
