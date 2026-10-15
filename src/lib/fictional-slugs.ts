/**
 * Fictional catalog rows from supabase/seed.sql (now seed.dev.sql).
 * Defense in depth: excluded from lists and treated as gone even before
 * migration 0005 is applied in production.
 */
export const FICTIONAL_SLUGS = [
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

export const FICTIONAL_SLUG_SET = new Set<string>(FICTIONAL_SLUGS);

export function isFictionalSlug(slug: string): boolean {
  return FICTIONAL_SLUG_SET.has(slug);
}
