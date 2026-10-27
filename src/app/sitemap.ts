import type { MetadataRoute } from 'next';
import { isThinSettlement } from '@/lib/catalog-page';
import { categoriesOf, getLawsuits } from '@/lib/lawsuits';
import { newestUpdatedAt } from '@/lib/settlement-hubs';
import {
  categoryHubPath,
  CLOSING_SOON_PATH,
  NEW_SETTLEMENTS_PATH,
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
  '/pricing',
  '/trust',
  '/about',
  '/privacy',
  '/terms',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lawsuits = await getLawsuits();
  const lastmod = newestUpdatedAt(lawsuits);

  const staticPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((path) => ({
    url: pageUrl(path),
    ...(lastmod ? { lastModified: lastmod } : {}),
  }));

  const hubs: MetadataRoute.Sitemap = [];
  if (lawsuits.length > 0 && lastmod) {
    hubs.push(
      { url: pageUrl(CLOSING_SOON_PATH), lastModified: lastmod },
      { url: pageUrl(NEW_SETTLEMENTS_PATH), lastModified: lastmod },
    );
    for (const category of categoriesOf(lawsuits)) {
      hubs.push({
        url: pageUrl(categoryHubPath(category)),
        lastModified: newestUpdatedAt(lawsuits.filter((l) => l.category === category)) ?? lastmod,
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
