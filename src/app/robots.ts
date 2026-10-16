import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';

/**
 * Paths no crawler should fetch: signed-in areas, claim and onboarding flows,
 * one-click unsubscribe links and machine endpoints.
 */
const ROBOTS_DISALLOW = [
  '/admin',
  '/dashboard',
  '/settings',
  '/api',
  '/claim',
  '/onboarding',
  '/unsubscribe',
];

export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, '');
  return {
    // One group for every crawler. A crawler that matches a named group
    // ignores the '*' group (RFC 9309), so never add a named group without
    // repeating these disallows in it.
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ROBOTS_DISALLOW,
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
