import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';
import { getLawsuits } from '@/lib/lawsuits';

// Public pages, plus one URL per settlement that is open for claims
// (getLawsuits applies isOpenForClaims: published, not fictional, open, deadline
// not passed). Closed, unpublished and fictional settlements never appear here.
// Sign-in, account, claim and API routes are left out and blocked in robots.ts.
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
  const base = SITE.url.replace(/\/$/, '');

  const staticPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
  }));

  const lawsuits = await getLawsuits();
  const lawsuitPages: MetadataRoute.Sitemap = lawsuits.map((lawsuit) => ({
    url: `${base}/lawsuits/${lawsuit.slug}`,
    lastModified: new Date(lawsuit.updated_at),
  }));

  return [...staticPages, ...lawsuitPages];
}
