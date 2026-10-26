import type { MetadataRoute } from 'next';
import { canonicalUrl } from '@/lib/utils';
import { getLawsuits } from '@/lib/lawsuits';

/**
 * Public, indexable routes only. Auth pages, closed rows, and fictional
 * listings are excluded. Static lastmod is a build-time constant — not
 * `new Date()` per request. Google ignores priority/changeFrequency.
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
  '/how-we-make-money',
];

const STATIC_LASTMOD = new Date('2026-10-15T00:00:00.000Z');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((path) => ({
    url: canonicalUrl(path),
    lastModified: STATIC_LASTMOD,
  }));

  const lawsuits = await getLawsuits();
  const lawsuitPages: MetadataRoute.Sitemap = lawsuits.map((lawsuit) => ({
    url: canonicalUrl(`/lawsuits/${lawsuit.slug}`),
    lastModified: new Date(lawsuit.last_verified_at ?? lawsuit.updated_at ?? STATIC_LASTMOD),
  }));

  return [...staticPages, ...lawsuitPages];
}
