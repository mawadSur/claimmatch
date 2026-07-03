import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';

export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep private/authenticated and machine-only surfaces out of the index.
      disallow: ['/admin', '/dashboard', '/settings', '/api'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
