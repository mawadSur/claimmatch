/**
 * Traffic classification for PostHog. Tags events so product reporting can
 * exclude bots, synthetic tests, and internal testers without deleting raw
 * history or touching first-touch UTMs.
 *
 * Allowed kinds are a closed set. Query param `cm_traffic` is accepted only
 * for those values (test | internal | bot). Never put email or other PII here.
 */

export const TRAFFIC_KINDS = ['product', 'internal', 'test', 'bot', 'qa'] as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];

export const TRAFFIC_QUERY_PARAM = 'cm_traffic';
export const QA_QUERY_PARAM = 'cm_qa';
export const QA_COOKIE = 'cm_qa';
export const TRAFFIC_PROPERTY = 'cm_traffic_kind';
/** product is real visitor traffic; keep the existing name so PostHog filters stay valid. */
export const REAL_TRAFFIC_KIND: TrafficKind = 'product';

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
  return value === 'test' || value === 'internal' || value === 'bot' || value === 'qa' ? value : null;
}

export function parseQaPromoList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesQaPromo(
  codes: readonly string[] | null | undefined,
  allowlist: readonly string[] = parseQaPromoList(process.env.QA_PROMO_CODES),
): boolean {
  if (!codes || codes.length === 0 || allowlist.length === 0) return false;
  const allowed = new Set(allowlist);
  return codes.some((code) => allowed.has(code.trim().toLowerCase()));
}

export function detectTrafficKind(input: {
  userAgent?: string | null;
  webdriver?: boolean;
  searchParam?: string | null;
  qaParam?: boolean;
  qaCookie?: boolean;
  qaPromo?: boolean;
  internal?: boolean;
}): TrafficKind {
  if (input.internal) return 'internal';
  const fromQuery = parseTrafficQuery(input.searchParam);
  if (fromQuery) return fromQuery;
  if (input.qaParam || input.qaCookie || input.qaPromo) return 'qa';
  if (input.webdriver) return 'test';
  const ua = (input.userAgent || '').toLowerCase();
  if (!ua) return 'product';
  if (TEST_UA.some((marker) => ua.includes(marker))) return 'test';
  if (BOT_UA.some((marker) => ua.includes(marker))) return 'bot';
  return 'product';
}

function funnelFlagOnFromDom(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.cmFunnel === '1';
}

function readQaCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => part.trim() === `${QA_COOKIE}=1`);
}

/** Persist ?cm_qa=1 so later pages stay tagged. No-op when the funnel flag is off. */
export function persistQaCookieFromLocation(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (!funnelFlagOnFromDom()) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get(QA_QUERY_PARAM) !== '1' && parseTrafficQuery(params.get(TRAFFIC_QUERY_PARAM)) !== 'qa') {
    return;
  }
  document.cookie = `${QA_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

/** Browser-only. Safe to call during capture; returns product during SSR. */
export function detectTrafficKindFromBrowser(): TrafficKind {
  if (typeof navigator === 'undefined') return 'product';
  const webdriver = Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  const searchParam = params?.get(TRAFFIC_QUERY_PARAM) ?? null;
  const qaParam = funnelFlagOnFromDom() && (params?.get(QA_QUERY_PARAM) === '1' || searchParam === 'qa');
  const qaCookie = funnelFlagOnFromDom() && readQaCookie();
  return detectTrafficKind({
    userAgent: navigator.userAgent,
    webdriver,
    searchParam,
    qaParam,
    qaCookie,
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
