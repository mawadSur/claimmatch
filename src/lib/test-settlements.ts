import { FICTIONAL_SLUGS } from './fictional-slugs';

/**
 * The one-click test settlement (scripts/one-click-test-settlement.ts,
 * docs/PRODUCTION-RUNBOOK.md, "One-click test mode"). Not real: no real
 * administrator, an example.test claim site, a TEST title. It must be
 * published for the claim flow to run, so every public list (catalog,
 * published archive, sitemap, matching, match alerts) leaves it out, and its
 * claim page is a 404 for anyone one-click is not on for.
 */
export const ONE_CLICK_TEST_SLUG = 'lawsuit-ai-one-click-test-settlement';

/** Title / slug patterns that mark a row as a test or dummy listing. */
const TEST_TITLE_RE =
  /\[(?:test|dummy|fake|sample)\]|\b(?:not a real settlement|test only|dummy settlement|sample settlement|fake settlement)\b/i;
const TEST_SLUG_RE =
  /(^|[-_])(?:test|dummy|sample|fake)([-_]|$)|one-click-test|example\.test/i;

export function isTestSettlementSlug(slug: string | null | undefined): boolean {
  return (slug ?? '').trim().toLowerCase() === ONE_CLICK_TEST_SLUG;
}

/**
 * Rows that must never render on public pages or the sitemap. Uses the
 * `is_test` column when present, plus slug/title patterns so a dummy row is
 * hidden even before the owner applies migration 0050.
 */
export function isPublicTestListing(row: {
  slug?: string | null;
  title?: string | null;
  is_test?: boolean | null;
}): boolean {
  if (row.is_test === true) return true;
  if (isTestSettlementSlug(row.slug)) return true;
  const slug = (row.slug ?? '').trim().toLowerCase();
  const title = (row.title ?? '').trim();
  if (title && TEST_TITLE_RE.test(title)) return true;
  if (slug && TEST_SLUG_RE.test(slug)) return true;
  return false;
}

export function rejectPublicTestListings<T extends { slug?: string | null; title?: string | null; is_test?: boolean | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isPublicTestListing(row));
}

/** Slugs every public list query leaves out: the 22 fictional ones and the test settlement. */
export const LIST_HIDDEN_SLUGS: readonly string[] = [...FICTIONAL_SLUGS, ONE_CLICK_TEST_SLUG];
