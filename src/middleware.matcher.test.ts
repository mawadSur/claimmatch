import { describe, expect, it } from 'vitest';
import { config } from './middleware';

// Next compiles the matcher with path-to-regexp. The single capture group here
// is a plain regular expression, so anchoring it is a close enough check of
// which paths reach middleware.
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runs = (path: string) => matcher.test(path);

describe('middleware matcher', () => {
  it('still runs on protected, auth and API paths', () => {
    for (const path of [
      '/',
      '/dashboard',
      '/onboarding',
      '/claim/some-case',
      '/settings/profile',
      '/admin',
      '/login',
      '/signup',
      '/auth/callback',
      '/api/cron/daily',
      '/api/session-flags',
      '/lawsuits',
      '/pricing',
      '/indexnow-abc123.txt',
    ]) {
      expect(runs(path), path).toBe(true);
    }
  });

  it('skips public static SEO pages, the PostHog proxy and crawler files', () => {
    for (const path of [
      '/lawsuits/some-settlement',
      '/lawsuits/some-settlement/opengraph-image',
      '/lawsuits/some-settlement/calendar.ics',
      '/settlements/category/health-pharma',
      '/settlements/closing-soon',
      '/ingest/e/',
      '/ingest/static/array.js',
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/_next/static/chunks/main.js',
      '/_next/image',
      '/favicon.ico',
      '/hero.webp',
    ]) {
      expect(runs(path), path).toBe(false);
    }
  });
});
