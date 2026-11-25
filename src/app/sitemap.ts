import type { MetadataRoute } from 'next';
import { isThinSettlement, LAWSUITS_PAGE_SIZE, paginatedPath } from '@/lib/catalog-page';
import { categoriesOf, getLawsuits } from '@/lib/lawsuits';
import { hubClosingSoon, hubClosingThisMonth, hubNewest, hubNoProofRequired, newestUpdatedAt } from '@/lib/settlement-hubs';
import { flags } from '@/lib/flags';
import {
  categoryHubPath,
  CLOSING_SOON_PATH,
  CLOSING_THIS_MONTH_PATH,
  FEATURED_CATEGORY_HUBS,
  NEW_SETTLEMENTS_PATH,
  NO_PROOF_PATH,
  pageUrl,
} from '@/lib/settlement-seo';

export const revalidate = 3600;

/**
 * Public pages plus one URL per settlement that is open for claims
 * (getLawsuits applies isOpenForClaims: published, not fictional, open,
 * deadline not passed). Closed, unpublished and fictional settlements never
 * appear here. Category / closing-soon / new hubs are included only when they
 * have at least one open row. Sign-in, account, claim and API routes are left
 * out and blocked in robots.ts.
 */
const PUBLIC_ROUTES = [
  '/',
  '/lawsuits',
  '/how-it-works',
  '/faq',
  '/pricing',
  '/how-we-make-money',
  '/trust',
  '/about',
  '/privacy',
  '/terms',
];

function publicRoutes(): string[] {
  const routes = flags.noticeLookup() ? [...PUBLIC_ROUTES, '/check'] : [...PUBLIC_ROUTES];
  return flags.trustScorecard() ? [...routes, '/scorecard'] : routes;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lawsuits = await getLawsuits();
  const lastmod = newestUpdatedAt(lawsuits);

  const staticPages: MetadataRoute.Sitemap = publicRoutes().map((path) => ({
    url: pageUrl(path),
    ...(lastmod ? { lastModified: lastmod } : {}),
  }));

  const hubs: MetadataRoute.Sitemap = [];
  if (lawsuits.length > 0 && lastmod) {
    if (hubClosingSoon(lawsuits).length > 0) {
      hubs.push({ url: pageUrl(CLOSING_SOON_PATH), lastModified: lastmod });
    }
    if (hubClosingThisMonth(lawsuits).length > 0) {
      hubs.push({ url: pageUrl(CLOSING_THIS_MONTH_PATH), lastModified: lastmod });
    }
    if (hubNoProofRequired(lawsuits).length > 0) {
      hubs.push({ url: pageUrl(NO_PROOF_PATH), lastModified: lastmod });
    }
    hubs.push({ url: pageUrl(NEW_SETTLEMENTS_PATH), lastModified: lastmod });
    const catalogPages = Math.max(1, Math.ceil(lawsuits.length / LAWSUITS_PAGE_SIZE));
    for (let page = 2; page <= catalogPages; page += 1) {
      hubs.push({ url: pageUrl(paginatedPath('/lawsuits', page)), lastModified: lastmod });
    }
    const newest = hubNewest(lawsuits);
    const newPages = Math.max(1, Math.ceil(newest.length / LAWSUITS_PAGE_SIZE));
    for (let page = 2; page <= newPages; page += 1) {
      hubs.push({ url: pageUrl(paginatedPath(NEW_SETTLEMENTS_PATH, page)), lastModified: lastmod });
    }
    const categoryNames = new Set([...FEATURED_CATEGORY_HUBS, ...categoriesOf(lawsuits)]);
    for (const category of categoryNames) {
      const inCategory = lawsuits.filter((l) => l.category === category);
      if (inCategory.length === 0) continue;
      hubs.push({
        url: pageUrl(categoryHubPath(category)),
        lastModified: newestUpdatedAt(inCategory) ?? lastmod,
      });
    }
  }

  const lawsuitPages: MetadataRoute.Sitemap = lawsuits
    .filter((lawsuit) => !isThinSettlement(lawsuit))
    .map((lawsuit) => ({
      url: pageUrl(`/lawsuits/${lawsuit.slug}`),
      lastModified: new Date(lawsuit.updated_at),
    }));

  return [...staticPages, ...hubs, ...lawsuitPages];
}
