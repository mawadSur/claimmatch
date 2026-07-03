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
 * ⚠️  Production use: respect the target site's robots.txt and Terms of Service,
 *     rate-limit requests, cache aggressively, and prefer an official feed/API.
 *     Scraping without permission may violate a site's terms.
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
        const res = await fetch(config.listUrl, {
          headers: {
            // Identify the crawler; real deployments should use a contactable URL.
            'user-agent': 'ClaimMatchBot/1.0 (+https://claimmatch.example/bot)',
            accept: 'text/html,application/xhtml+xml',
          },
          // Bail out rather than hang on a slow source.
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const html = await res.text();
        return parseListing(html, config);
      } catch {
        // Network error, timeout, DNS failure, etc. — degrade to empty.
        return [];
      }
    },
  };
}
