/**
 * Official links, provenance, summaries and search for catalog rows. Pure
 * functions (no Supabase, no React), so the native app can import them;
 * re-exported from './lawsuits' for the web.
 */
import type { Lawsuit } from './types';
import { isPlaceholderUrl } from './utils';

// ---------------------------------------------------------------------------
// Links and provenance
// ---------------------------------------------------------------------------

export interface CatalogLink {
  href: string;
  /** 'official': the settlement's own claim or notice site. 'source': where we found the listing. */
  kind: 'official' | 'source';
  /** Plain link text, e.g. "Official site" or "SettleSignal listing". */
  label: string;
  /** Host name without "www.", to show people where the link goes. */
  host: string;
}

function webUrl(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (isPlaceholderUrl(parsed.href)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSettleSignalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'settlesignal.com' || h.endsWith('.settlesignal.com');
}

function displayHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * The link behind "check the official site": the record's claim URL (the
 * official claim or settlement site) when it has one; otherwise its source
 * page, labeled as a source. A settlesignal.com page is a third-party listing,
 * never "the official site". Only http(s) links count.
 */
export function officialLinkFor(lawsuit: Pick<Lawsuit, 'claim_url' | 'source_url'>): CatalogLink | null {
  const claim = webUrl(lawsuit.claim_url);
  if (claim && !isSettleSignalHost(claim.hostname)) {
    return { href: claim.href, kind: 'official', label: 'Official site', host: displayHost(claim) };
  }
  const source = webUrl(lawsuit.source_url) ?? claim;
  if (!source) return null;
  if (isSettleSignalHost(source.hostname)) {
    return { href: source.href, kind: 'source', label: 'SettleSignal listing', host: 'settlesignal.com' };
  }
  return { href: source.href, kind: 'source', label: 'Source page', host: displayHost(source) };
}

/**
 * The claim URL for a link labeled as the official site or claim form, or
 * null when officialLinkFor would not call it official (a settlesignal.com
 * page, a placeholder or a non-http(s) link).
 */
export function officialSiteUrl(claimUrl: string | null | undefined): string | null {
  const link = officialLinkFor({ claim_url: claimUrl ?? null, source_url: null });
  return link?.kind === 'official' ? link.href : null;
}

/**
 * The summary worth showing, or null when it only repeats the title and the
 * payout (the SettleSignal adapter builds "<title>. Estimated payout: <payout>").
 */
export function displaySummary(
  lawsuit: Pick<Lawsuit, 'title' | 'summary' | 'typical_payout'>,
): string | null {
  const summary = lawsuit.summary?.trim();
  if (!summary) return null;
  const title = lawsuit.title.trim();
  if (summary === title) return null;
  const payout = lawsuit.typical_payout?.trim();
  if (payout && summary === `${title}. Estimated payout: ${payout}`) return null;
  return summary;
}

/** The SettleSignal listing page for a record, when there is one. */
export function settleSignalPageFor(lawsuit: Pick<Lawsuit, 'source_url'>): string | null {
  const source = webUrl(lawsuit.source_url);
  return source && isSettleSignalHost(source.hostname) ? source.href : null;
}

/**
 * True when the record came from the SettleSignal feed, so its page must carry
 * SettleSignal's CC BY 4.0 credit. Other records must not be credited to it.
 */
export function isSettleSignalRecord(lawsuit: Pick<Lawsuit, 'external_id' | 'source_url'>): boolean {
  if (lawsuit.external_id?.startsWith('settlesignal:')) return true;
  return settleSignalPageFor(lawsuit) !== null;
}

// ---------------------------------------------------------------------------
// Search and categories
// ---------------------------------------------------------------------------

const MAX_QUERY_LENGTH = 100;

/** Clean a free-text search term from the URL: trimmed, bounded, or undefined. */
export function cleanSearchTerm(q: string | null | undefined): string | undefined {
  const term = (q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  return term || undefined;
}

/** Distinct categories of the given rows, A to Z. */
export function categoriesOf(lawsuits: Pick<Lawsuit, 'category'>[]): string[] {
  return Array.from(new Set(lawsuits.map((l) => l.category).filter(Boolean))).sort();
}

/**
 * Filter an already-loaded list by category and a free-text search over the
 * title and summary (case-insensitive; every word must appear).
 */
export function searchCatalog<T extends Pick<Lawsuit, 'title' | 'summary' | 'category'>>(
  lawsuits: T[],
  opts: { q?: string; category?: string },
): T[] {
  const words = (cleanSearchTerm(opts.q) ?? '').toLowerCase().split(' ').filter(Boolean);
  return lawsuits.filter((l) => {
    if (opts.category && l.category !== opts.category) return false;
    if (words.length === 0) return true;
    const text = `${l.title} ${l.summary ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
