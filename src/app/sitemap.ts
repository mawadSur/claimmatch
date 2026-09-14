import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';
import { getLawsuits } from '@/lib/lawsuits';

// Public, indexable routes only. Authenticated/admin areas (dashboard, settings,
// admin) and API routes are intentionally excluded and blocked in robots.ts.
const PUBLIC_ROUTES = [
  '/',
  '/lawsuits',
  '/how-it-works',
  '/pricing',
  '/trust',
  '/about',
  '/privacy',
  '/terms',
  '/login',
  '/signup',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url.replace(/\/$/, '');
  const lastModified = new Date();

  const staticPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: path === '/lawsuits' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : path === '/lawsuits' ? 0.9 : 0.6,
  }));

  const lawsuits = await getLawsuits();
  const lawsuitPages: MetadataRoute.Sitemap = lawsuits.map((lawsuit) => ({
    url: `${base}/lawsuits/${lawsuit.slug}`,
    lastModified: new Date(lawsuit.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticPages, ...lawsuitPages];
}
