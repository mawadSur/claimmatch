import { isFictionalSlug } from './fictional-slugs';
import { isDeadlinePassed } from './utils';

/**
 * The one "open for claims" rule. Every surface uses it: the catalog, the
 * sitemap, matching, the ingest, the claim flow and the dashboard.
 *
 * Pure (no Supabase, no network), so client components can use it too.
 * src/lib/lawsuits.ts re-exports it for server code, and src/lib/claims.ts
 * re-exports it for the claim flow.
 */

/**
 * Statuses that can take claims. 'closed' and 'draft' cannot, and neither can
 * any status added later until this rule is updated to allow it.
 */
export const OPEN_STATUSES = ['open', 'closing_soon'] as const;

/** The fields the rule reads. Plain strings, so database rows and Lawsuit both fit. */
export interface OpenRuleFields {
  slug: string;
  status: string;
  review_status?: string | null;
  deadline?: string | null;
}

/** Published and not fictional: the settlement page may be shown to anyone. */
export function isPublicLawsuit(lawsuit: Pick<OpenRuleFields, 'slug' | 'review_status'>): boolean {
  return lawsuit.review_status === 'published' && !isFictionalSlug(lawsuit.slug);
}

/**
 * Published, not fictional, status open (or closing soon), and the deadline has
 * not passed. No deadline counts as open. A date-only deadline stays open
 * through 23:59:59 Pacific/Honolulu, the latest US time zone (see
 * isDeadlinePassed); people are told to check the official site for the exact
 * cutoff.
 */
export function isOpenForClaims(lawsuit: OpenRuleFields, now: Date = new Date()): boolean {
  if (!isPublicLawsuit(lawsuit)) return false;
  if (!(OPEN_STATUSES as readonly string[]).includes(lawsuit.status)) return false;
  return !isDeadlinePassed(lawsuit.deadline, now);
}

/** The rows that are open for claims, in their original order. */
export function filterOpenForClaims<T extends OpenRuleFields>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter((row) => isOpenForClaims(row, now));
}
