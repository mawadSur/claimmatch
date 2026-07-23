import type { ScrapedLawsuit } from '@/lib/types';
import type { SourceAdapter } from './index';

/**
 * Template for a real HTML-scraping source. `makeHtmlAdapter` returns a
 * {@link SourceAdapter} whose `fetch()` downloads a listing page and does a
 * BEST-EFFORT regex parse of its anchor links into {@link ScrapedLawsuit} stubs.
 * It is intentionally dependency-free (global `fetch` + regex only, no cheerio)
 * so it compiles and runs anywhere.
 *
 * This is a STARTING POINT, not a finished integration: the stubs it produces
 * carry only a title + URLs and a `category` of "General". Extend the parser to
 * extract payout, deadline, and eligibility copy, and set an accurate category.
 *
 * ToS / robots.txt compliance is enforced, not just documented:
 *   - Before crawling, `fetch()` downloads and parses the target's robots.txt
 *     and skips the run when the listing path is disallowed for our crawler.
 *     If robots.txt can't be determined (network error, timeout, 5xx), it FAILS
 *     SAFE and does not fetch.
 *   - Requests are rate-limited per host and carry a descriptive, contactable
 *     User-Agent so the operator can be reached.
 *
 * ⚠️  Production use: an operator must still confirm the target site's Terms of
 *     Service permit automated access before enabling a real source. Prefer an
 *     official feed/API over scraping.
 */
export interface HtmlAdapterConfig {
  /** Stable unique key (also `sources.slug`). */
  slug: string;
  /** Human-readable source name. */
  name: string;
  /** Listing page to fetch and parse. */
  listUrl: string;
  /** Optional canonical homepage. */
  homepage?: string;
}

/**
 * Descriptive, contactable crawler identity. Real deployments should point the
 * contact URL at a page describing the bot and how to block it.
 */
const USER_AGENT = 'ClaimMatchBot/1.0 (+https://claimmatch.example/bot)';
/** The token we match against robots.txt `User-agent:` groups. */
const UA_TOKEN = 'ClaimMatchBot';
/** Minimum delay between requests to the SAME host (politeness). */
const MIN_HOST_INTERVAL_MS = 2_000;
/** Per-request network timeout. */
const FETCH_TIMEOUT_MS = 15_000;

/** Deterministic djb2 hash → base36. Used to build stable external_ids. */
function hashUrl(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    // (h * 33) ^ char, kept in unsigned 32-bit range.
    h = (((h << 5) + h) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** Strip HTML tags and decode a handful of common entities. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a possibly-relative href against the listing URL. */
function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ── Politeness: per-host rate limiting ──────────────────────────────────────
// Tracks the last request time per host so back-to-back fetches (this run or a
// concurrent one in the same process) stay at least MIN_HOST_INTERVAL_MS apart.
const lastRequestAt = new Map<string, number>();

async function throttle(host: string): Promise<void> {
  const now = Date.now();
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + MIN_HOST_INTERVAL_MS - now;
  // Reserve our slot immediately so parallel callers queue behind us.
  lastRequestAt.set(host, Math.max(now, last + MIN_HOST_INTERVAL_MS));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Fetch text with a timeout and our crawler UA. Returns null on any failure. */
async function politeFetch(
  url: string,
  accept: string,
): Promise<{ status: number; text: string } | null> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  await throttle(host);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = res.ok ? await res.text() : '';
    return { status: res.status, text };
  } catch {
    // Network error, timeout, DNS failure, etc.
    return null;
  }
}

// ── robots.txt ──────────────────────────────────────────────────────────────

/**
 * Decide whether our crawler may fetch `targetUrl`, per the origin's robots.txt.
 *
 * Fail-safe semantics:
 *   - Network error / timeout / 5xx while fetching robots.txt → NOT allowed.
 *   - A definitive 404 (or empty body) → no restrictions, allowed (RFC 9309).
 *   - Otherwise, evaluate the matching group's Allow/Disallow rules.
 */
async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  let origin: string;
  let path: string;
  try {
    const u = new URL(targetUrl);
    origin = u.origin;
    path = u.pathname + u.search;
  } catch {
    return false;
  }

  const robots = await politeFetch(`${origin}/robots.txt`, 'text/plain');
  if (!robots) return false; // couldn't reach robots.txt → fail safe
  if (robots.status === 404 || robots.text.trim() === '') return true; // no rules
  if (robots.status >= 400) return false; // 401/403/5xx etc. → fail safe

  return pathAllowed(robots.text, path);
}

/**
 * Minimal robots.txt evaluator. Groups consecutive `User-agent` lines with the
 * rule lines that follow them, selects the groups whose agent matches our token
 * (falling back to `*`), then applies longest-match precedence (Allow wins ties)
 * — the widely-adopted behavior (RFC 9309).
 */
function pathAllowed(robotsTxt: string, path: string): boolean {
  type Rule = { allow: boolean; path: string };
  type Group = { agents: string[]; rules: Rule[] };

  const groups: Group[] = [];
  let current: Group | null = null;
  // A run of consecutive `User-agent` lines opens a group; the first rule line
  // closes the agent list, so a later `User-agent` line starts a fresh group.
  let expectingAgents = true;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !expectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) continue; // rule with no preceding user-agent
      expectingAgents = false;
      current.rules.push({ allow: field === 'allow', path: value });
    }
    // other fields (Sitemap, Crawl-delay, …) are ignored
  }

  const uaLower = UA_TOKEN.toLowerCase();
  const specific: Rule[] = [];
  const star: Rule[] = [];
  for (const g of groups) {
    for (const agent of g.agents) {
      // A group applies to us when its agent token is a prefix of our product
      // token (case-insensitive), e.g. `ClaimMatch` matches `ClaimMatchBot`.
      if (agent === '*') star.push(...g.rules);
      else if (agent && uaLower.startsWith(agent)) specific.push(...g.rules);
    }
  }

  // Rules that name our crawler win over the wildcard group entirely.
  const rules = specific.length > 0 ? specific : star;
  if (rules.length === 0) return true; // no applicable rules → allowed

  let decision = true;
  let bestLen = -1;
  for (const rule of rules) {
    if (rule.path === '') continue; // empty value = no restriction; skip
    if (!matchesRobotsPath(path, rule.path)) continue;
    // Longest match wins; Allow beats Disallow on equal length.
    if (rule.path.length > bestLen || (rule.path.length === bestLen && rule.allow)) {
      bestLen = rule.path.length;
      decision = rule.allow;
    }
  }
  return decision;
}

/** robots.txt path match: prefix match with `*` wildcard and `$` end-anchor. */
function matchesRobotsPath(path: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.endsWith('$')) {
    return path.startsWith(pattern);
  }
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + escaped + (anchored ? '$' : ''));
  return re.test(path);
}

/** Best-effort extraction of settlement-looking links from listing HTML. */
function parseListing(html: string, config: HtmlAdapterConfig): ScrapedLawsuit[] {
  const results: ScrapedLawsuit[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*?href=["']([^"'#]+)["'][^>]*?>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const title = stripTags(match[2]);
    if (title.length < 8) continue; // skip nav/icon links

    const href = absolutize(match[1], config.listUrl);
    if (!href || seen.has(href)) continue;

    // Heuristic: only keep links that look like a settlement/lawsuit page.
    if (!/settle|lawsuit|claim|class[-\s]?action/i.test(`${href} ${title}`)) continue;

    seen.add(href);
    results.push({
      external_id: `${config.slug}:${hashUrl(href)}`,
      title,
      summary: title,
      category: 'General',
      proof_required: false,
      source_url: href,
      claim_url: href,
    });

    if (results.length >= 50) break; // safety cap
  }

  return results;
}

export function makeHtmlAdapter(config: HtmlAdapterConfig): SourceAdapter {
  return {
    slug: config.slug,
    name: config.name,
    homepage: config.homepage,
    async fetch(): Promise<ScrapedLawsuit[]> {
      try {
        // 1) Respect robots.txt before touching the listing page.
        const allowed = await isAllowedByRobots(config.listUrl);
        if (!allowed) {
          console.warn(
            `[scraper:${config.slug}] robots.txt disallows or is unreachable for ${config.listUrl}; skipping.`,
          );
          return [];
        }

        // 2) Fetch the listing page politely.
        const res = await politeFetch(config.listUrl, 'text/html,application/xhtml+xml');
        if (!res || res.status !== 200 || !res.text) return [];

        return parseListing(res.text, config);
      } catch {
        // Belt-and-suspenders: never let a source crash the whole run.
        return [];
      }
    },
  };
}
