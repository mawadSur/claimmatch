/**
 * Traffic classification for PostHog. Tags events so product reporting can
 * exclude bots, synthetic tests, and internal testers without deleting raw
 * history or touching first-touch UTMs.
 *
 * Allowed kinds are a closed set. Query param `cm_traffic` is accepted only
 * for those values (test | internal | bot). Never put email or other PII here.
 */

export const TRAFFIC_KINDS = ['product', 'internal', 'test', 'bot'] as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];

export const TRAFFIC_QUERY_PARAM = 'cm_traffic';
export const TRAFFIC_PROPERTY = 'cm_traffic_kind';

const TEST_UA = [
  'claimmatchsmoke',
  'playwright',
  'headlesschrome',
  'cypress',
  'puppeteer',
];

const BOT_UA = [
  'bot',
  'crawler',
  'crawl',
  'spider',
  'slurp',
  'uptime',
  'monitor',
  'headless',
  'preview',
  'claude-code',
  'claude-user',
  'perplexity',
  'gptbot',
  'chatgpt',
  'anthropic',
  'curl/',
  'wget/',
  'python-requests',
  'httpie',
  'go-http-client',
];

export function isTrafficKind(value: unknown): value is TrafficKind {
  return typeof value === 'string' && (TRAFFIC_KINDS as readonly string[]).includes(value);
}

/** Closed-set query value. Unknown strings are ignored so UTMs stay intact. */
export function parseTrafficQuery(raw: string | null | undefined): TrafficKind | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return value === 'test' || value === 'internal' || value === 'bot' ? value : null;
}

export function detectTrafficKind(input: {
  userAgent?: string | null;
  webdriver?: boolean;
  searchParam?: string | null;
  internal?: boolean;
}): TrafficKind {
  if (input.internal) return 'internal';
  const fromQuery = parseTrafficQuery(input.searchParam);
  if (fromQuery) return fromQuery;
  if (input.webdriver) return 'test';
  const ua = (input.userAgent || '').toLowerCase();
  if (!ua) return 'product';
  if (TEST_UA.some((marker) => ua.includes(marker))) return 'test';
  if (BOT_UA.some((marker) => ua.includes(marker))) return 'bot';
  return 'product';
}

/** Browser-only. Safe to call during capture; returns product during SSR. */
export function detectTrafficKindFromBrowser(): TrafficKind {
  if (typeof navigator === 'undefined') return 'product';
  const webdriver = Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  const searchParam =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get(TRAFFIC_QUERY_PARAM);
  return detectTrafficKind({
    userAgent: navigator.userAgent,
    webdriver,
    searchParam,
  });
}

/**
 * $pageview must not fire for API/health probes or quoted-path 404 HTML.
 * Other bot pageviews are tagged, not dropped, so history stays queryable.
 */
export function shouldCapturePageview(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !isApiOrHealthPath(pathname) && !hasStrayQuote(pathname);
}

export function isApiOrHealthPath(pathname: string): boolean {
  const path = stripQuery(pathname);
  if (path === '/api' || path.startsWith('/api/')) return true;
  if (path.includes('/api/health')) return true;
  return false;
}

export function hasStrayQuote(pathname: string): boolean {
  const path = stripQuery(pathname);
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  return /['"`]/.test(path) || /['"`]/.test(decoded);
}

export function isMalformedApiPath(pathname: string): boolean {
  const path = stripQuery(pathname);
  if (!isApiOrHealthPath(path) && !path.startsWith('/api')) return false;
  return hasStrayQuote(path);
}

function stripQuery(pathname: string): string {
  const cut = pathname.indexOf('?');
  return cut === -1 ? pathname : pathname.slice(0, cut);
}
