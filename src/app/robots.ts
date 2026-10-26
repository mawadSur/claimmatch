import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';

export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, '');
  const disallow = ['/admin', '/dashboard', '/settings', '/api'];
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Bingbot', allow: '/' },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
