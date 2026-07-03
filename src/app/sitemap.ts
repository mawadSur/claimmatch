import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';

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

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, '');
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: path === '/lawsuits' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : path === '/lawsuits' ? 0.9 : 0.6,
  }));
}
