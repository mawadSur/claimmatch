import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/utils';

/**
 * Paths no crawler should fetch: signed-in areas, claim and onboarding flows,
 * one-click unsubscribe links and machine endpoints.
 *
 * Search / answer crawlers (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot,
 * ChatGPT-User) match this single '*' group, so they may fetch public
 * settlement pages (/lawsuits, hubs, /how-it-works, /trust, /privacy, /terms)
 * and are blocked from /admin, /api, and account paths below.
 *
 * Training crawlers (GPTBot, Google-Extended, CCBot, anthropic-ai, …) are
 * not given a named group, so they also follow '*': public pages allowed,
 * private paths disallowed. Do not add a GPTBot (or similar) group without
 * repeating every disallow — a named group ignores '*' (RFC 9309).
 */
const ROBOTS_DISALLOW = [
  '/admin',
  '/dashboard',
  '/settings',
  '/api',
  '/claim',
  '/onboarding',
  '/unsubscribe',
  '/preview',
  '/invite',
];

/** Crawlers we explicitly want on public settlement pages. Documented in tests. */
export const SEARCH_ANSWER_CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'PerplexityBot',
  'ChatGPT-User',
] as const;

/** Training crawlers that currently follow the '*' group. Policy unchanged. */
export const TRAINING_CRAWLERS_FOLLOWING_STAR = [
  'GPTBot',
  'Google-Extended',
  'CCBot',
  'anthropic-ai',
  'ClaudeBot',
] as const;

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
