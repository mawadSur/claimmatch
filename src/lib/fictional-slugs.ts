/**
 * The 22 sample settlements (test data, not real settlements) that were
 * published in production.
 *
 * - 16 came from the old supabase/seed.sql (now supabase/seed.dev.sql).
 * - 6 came from the sample-aggregator scraper adapter
 *   (src/lib/scraper/sources/sample-source.ts); their slug is slugify(title).
 *
 * Migration 0009_unpublish_fictional.sql unpublishes the same rows by status
 * (never by DELETE, which would cascade into users' claims). This list is the
 * second guard: the app leaves these slugs out of every list, the sitemap and
 * matching, and their pages return 404, even before 0009 runs.
 *
 * tests/catalog-fictional.test.ts checks this list against both sources and
 * against 0009, so the three cannot drift apart.
 */

/** Slugs of the 16 fictional rows in supabase/seed.dev.sql. */
export const SEED_FICTIONAL_SLUGS = [
  'healthcare-provider-data-breach-2025',
  'prepaid-card-hidden-fees-settlement',
  'smart-tv-viewing-data-settlement',
  'defective-brake-system-settlement',
  'contaminated-eye-drops-settlement',
  'gig-driver-expense-reimbursement-settlement',
  'protein-powder-protein-spiking-settlement',
  'wireless-router-security-flaw-settlement',
  'nonstick-cookware-coating-settlement',
  'robocall-tcpa-settlement',
  'university-student-records-breach-settlement',
  'mortgage-late-fee-settlement',
  'voice-assistant-recording-settlement',
  'sunscreen-benzene-recall-settlement',
  'retail-off-the-clock-wages-settlement',
  'sparkling-water-natural-flavor-settlement',
] as const;

/** Slugs the sample-aggregator adapter produced (slugify of each title). */
export const SAMPLE_ADAPTER_FICTIONAL_SLUGS = [
  'heartburn-medication-impurity-settlement',
  'unpaid-overtime-missed-break-wage-settlement',
  'extra-virgin-olive-oil-mislabeling-settlement',
  'wireless-administrative-fee-settlement',
  'photo-app-face-geometry-privacy-settlement',
  'dishwasher-control-board-defect-settlement',
] as const;

/** All 22 fictional slugs. */
export const FICTIONAL_SLUGS: readonly string[] = [
  ...SEED_FICTIONAL_SLUGS,
  ...SAMPLE_ADAPTER_FICTIONAL_SLUGS,
];

const FICTIONAL_SLUG_SET: ReadonlySet<string> = new Set(FICTIONAL_SLUGS);

/** True when the slug belongs to one of the 22 fictional settlements. */
export function isFictionalSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return FICTIONAL_SLUG_SET.has(slug.trim().toLowerCase());
}
