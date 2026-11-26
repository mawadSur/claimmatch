/**
 * On-demand ISR for catalog pages. Claim-action and status edits should show
 * on the next request, not after the hourly settlement-page window.
 *
 * Pages still export a numeric `revalidate` (Next.js ISR). This module only
 * busts that cache when an admin or the owner-apply revalidate endpoint runs.
 */
import { revalidatePath } from 'next/cache';

/** Settlement detail pages. Low enough that a claim_action SQL apply is not stuck for an hour. */
export const SETTLEMENT_PAGE_REVALIDATE_SECONDS = 300;

/** Home and /lawsuits list. */
export const CATALOG_LIST_REVALIDATE_SECONDS = 900;

export function revalidateCatalogPaths(slug?: string | null): string[] {
  const paths = ['/', '/lawsuits', '/sitemap.xml'];
  const trimmed = slug?.trim();
  if (trimmed) {
    paths.push(`/lawsuits/${trimmed}`, `/claim/${trimmed}`);
  } else {
    paths.push(
      '/settlements/closing-soon',
      '/settlements/closing-this-month',
      '/settlements/no-proof-required',
      '/settlements/new',
      '/settlements/recently-closed',
    );
  }
  return paths;
}

/** Bust cached catalog HTML. Safe to call from a Route Handler. */
export function revalidateCatalog(slug?: string | null): string[] {
  const paths = revalidateCatalogPaths(slug);
  for (const path of paths) {
    revalidatePath(path);
  }
  if (!slug?.trim()) {
    revalidatePath('/lawsuits', 'layout');
    revalidatePath('/settlements', 'layout');
  }
  return paths;
}
