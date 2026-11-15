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

export function isTestSettlementSlug(slug: string | null | undefined): boolean {
  return (slug ?? '').trim().toLowerCase() === ONE_CLICK_TEST_SLUG;
}

/** Slugs every public list query leaves out: the 22 fictional ones and the test settlement. */
export const LIST_HIDDEN_SLUGS: readonly string[] = [...FICTIONAL_SLUGS, ONE_CLICK_TEST_SLUG];
