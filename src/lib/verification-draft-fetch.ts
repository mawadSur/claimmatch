/**
 * Polite official-site fetch for verification drafts. Cron and admin-trigger
 * only. Rate-limited, time-boxed, robots.txt-aware. Never imported from a
 * client component.
 */
import { VERIFY_ASSIST_BODY_LIMIT } from '@/lib/verification-draft';

export const VERIFY_ASSIST_USER_AGENT = 'ClaimMatchVerifyAssist/1.0 (+https://lawsuitai.org)';
export const VERIFY_ASSIST_TIMEOUT_MS = 8_000;
export const VERIFY_ASSIST_ROBOTS_TIMEOUT_MS = 5_000;
export const VERIFY_ASSIST_GAP_MS = 500;
export const VERIFY_ASSIST_MAX_PER_RUN = 10;
export const VERIFY_ASSIST_BUDGET_MS = 40_000;
export const VERIFY_ASSIST_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type VerifyAssistFetchSignal = 'ok' | 'robots_disallow' | 'timeout' | 'error' | 'invalid_url';

export interface VerifyAssistFetchResult {
  http_status: number | null;
  robots_allowed: boolean;
  body: string;
  signal: VerifyAssistFetchSignal;
  error?: string;
}

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message) : '';
  return name === 'AbortError' || /timeout|aborted/i.test(message);
}

function productToken(userAgent: string): string {
  const token = userAgent.split(/[/\s]/)[0]?.trim() ?? '';
  return token.toLowerCase();
}

/**
 * Prefix matching as in the original robots.txt spec. Longest matching
 * Allow/Disallow in the applicable group wins; equal length prefers Allow.
 */
export function robotsAllowsPath(
  robotsTxt: string,
  userAgent: string,
  path: string,
): boolean {
  const ua = productToken(userAgent);
  type Rule = { allow: boolean; prefix: string };
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      if (current && current.rules.length === 0 && current.agents.length > 0) {
        current.agents.push(agent);
      } else {
        current = { agents: [agent], rules: [] };
        groups.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      current.rules.push({ allow: key === 'allow', prefix: value });
    }
  }

  const specific = groups.filter((g) => g.agents.includes(ua));
  const star = groups.filter((g) => g.agents.includes('*'));
  const applicable = (specific.length > 0 ? specific : star).flatMap((g) => g.rules);
  if (applicable.length === 0) return true;

  let best: Rule | null = null;
  for (const rule of applicable) {
    if (!rule.prefix) {
      // Disallow: with an empty prefix means allow everything.
      if (!rule.allow) continue;
      if (!best) best = rule;
      continue;
    }
    if (!path.startsWith(rule.prefix) && rule.prefix !== '/') continue;
    if (rule.prefix === '/' || path.startsWith(rule.prefix)) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule;
      else if (rule.prefix.length === best.prefix.length && rule.allow && !best.allow) best = rule;
    }
  }
  if (!best) return true;
  return best.allow;
}

export async function fetchRobotsTxt(
  origin: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = VERIFY_ASSIST_ROBOTS_TIMEOUT_MS,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL('/robots.txt', origin);
  } catch {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url.toString(), {
      method: 'GET',
      headers: { 'user-agent': VERIFY_ASSIST_USER_AGENT, accept: 'text/plain, */*;q=0.2' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (res.status === 404) return '';
    if (!res.ok) return null;
    return (await res.text()).slice(0, 64_000);
  } catch (err) {
    if (isTimeout(err)) return null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOfficialPage(
  url: string,
  fetchFn: typeof fetch = fetch,
  opts: { timeoutMs?: number; robotsTxt?: string | null; skipRobots?: boolean } = {},
): Promise<VerifyAssistFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { http_status: null, robots_allowed: false, body: '', signal: 'invalid_url', error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { http_status: null, robots_allowed: false, body: '', signal: 'invalid_url', error: 'invalid_url' };
  }

  let robotsTxt = opts.robotsTxt;
  if (!opts.skipRobots && robotsTxt === undefined) {
    robotsTxt = await fetchRobotsTxt(parsed.origin, fetchFn);
  }
  // Missing/unreachable robots.txt is treated as no restriction.
  if (typeof robotsTxt === 'string' && robotsTxt.length > 0) {
    const path = `${parsed.pathname || '/'}${parsed.search}`;
    if (!robotsAllowsPath(robotsTxt, VERIFY_ASSIST_USER_AGENT, path)) {
      return { http_status: null, robots_allowed: false, body: '', signal: 'robots_disallow', error: 'robots_disallow' };
    }
  }

  const timeoutMs = opts.timeoutMs ?? VERIFY_ASSIST_TIMEOUT_MS;
  const headers = { 'user-agent': VERIFY_ASSIST_USER_AGENT, accept: 'text/html, */*;q=0.8' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(parsed.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    let body = '';
    try {
      body = (await res.text()).slice(0, VERIFY_ASSIST_BODY_LIMIT);
    } catch {
      body = '';
    }
    if (!res.ok) {
      return {
        http_status: res.status,
        robots_allowed: true,
        body: '',
        signal: 'error',
        error: `http_${res.status}`,
      };
    }
    return { http_status: res.status, robots_allowed: true, body, signal: 'ok' };
  } catch (err) {
    if (isTimeout(err)) {
      return { http_status: null, robots_allowed: true, body: '', signal: 'timeout', error: 'timeout' };
    }
    return { http_status: null, robots_allowed: true, body: '', signal: 'error', error: 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function needsVerificationDraft(
  row: { drafted_at: string | null },
  now: Date,
  staleMs = VERIFY_ASSIST_STALE_MS,
): boolean {
  if (!row.drafted_at) return true;
  const at = Date.parse(row.drafted_at);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= staleMs;
}
