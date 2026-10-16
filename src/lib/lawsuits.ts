import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Lawsuit } from './types';
import { FICTIONAL_SLUGS, isFictionalSlug } from './fictional-slugs';
import { isDeadlinePassed, isPlaceholderUrl, todayInLatestUSZone } from './utils';

/**
 * Data access for the public settlement catalog (server only).
 *
 * Every list returns only settlements that are open for claims (see
 * isOpenForClaims). There is no fallback to sample data: when the database is
 * not configured or a query fails, lists come back empty and lookups find
 * nothing, so made-up settlements can never reach a visitor. The catalog pages
 * use the lookup* variants to tell "nothing to show" from "could not load".
 */

function supabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// ---------------------------------------------------------------------------
// The open-for-claims rule
// ---------------------------------------------------------------------------

/**
 * Statuses that can take claims. 'closed' and 'draft' cannot, and neither can
 * any status added later until this rule is updated to allow it.
 */
const OPEN_STATUSES = ['open', 'closing_soon'] as const;

type RuleFields = Pick<Lawsuit, 'slug' | 'status' | 'review_status' | 'deadline'>;

/** Published and not fictional: the settlement page may be shown to anyone. */
export function isPublicLawsuit(lawsuit: Pick<Lawsuit, 'slug' | 'review_status'>): boolean {
  return lawsuit.review_status === 'published' && !isFictionalSlug(lawsuit.slug);
}

/**
 * The one "open for claims" rule, used on every surface (catalog, sitemap,
 * matching, claim creation): published, not fictional, status open (or closing
 * soon), and the deadline has not passed. No deadline counts as open. A
 * date-only deadline stays open through 23:59:59 Pacific/Honolulu, the latest
 * US time zone (see isDeadlinePassed); people are told to check the official
 * site for the exact cutoff.
 */
export function isOpenForClaims(lawsuit: RuleFields, now: Date = new Date()): boolean {
  if (!isPublicLawsuit(lawsuit)) return false;
  if (!(OPEN_STATUSES as readonly string[]).includes(lawsuit.status)) return false;
  return !isDeadlinePassed(lawsuit.deadline, now);
}

/** The rows that are open for claims, in their original order. */
export function filterOpenForClaims<T extends RuleFields>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter((row) => isOpenForClaims(row, now));
}

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
// Queries
// ---------------------------------------------------------------------------

export interface CatalogQuery {
  category?: string;
  q?: string;
  featured?: boolean;
  limit?: number;
}

export interface CatalogResult {
  lawsuits: Lawsuit[];
  /** True when the database could not be read (as opposed to "nothing open"). */
  error: boolean;
}

const MAX_QUERY_LENGTH = 100;

/** Escape LIKE wildcards so a search for "50%" matches the text "50%". */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Clean a free-text search term from the URL: trimmed, bounded, or undefined. */
export function cleanSearchTerm(q: string | null | undefined): string | undefined {
  const term = (q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  return term || undefined;
}

/**
 * Settlements open for claims, featured first, then by nearest deadline (no
 * deadline last). Reports whether the database could be read.
 */
export async function lookupLawsuits(
  opts?: CatalogQuery,
  now: Date = new Date(),
): Promise<CatalogResult> {
  if (!supabaseConfigured()) return { lawsuits: [], error: false };
  try {
    const supabase = await createClient();
    let query = supabase
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'published')
      .in('status', [...OPEN_STATUSES])
      .or(`deadline.is.null,deadline.gte.${todayInLatestUSZone(now)}`)
      .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`)
      .order('is_featured', { ascending: false })
      .order('deadline', { ascending: true, nullsFirst: false });

    const q = cleanSearchTerm(opts?.q);
    if (opts?.category) query = query.eq('category', opts.category);
    if (opts?.featured) query = query.eq('is_featured', true);
    if (q) query = query.ilike('title', `%${escapeLike(q)}%`);
    if (opts?.limit) query = query.limit(opts.limit);

    const { data, error } = await query;
    if (error) {
      console.error('[lawsuits] catalog query failed:', error.message);
      return { lawsuits: [], error: true };
    }
    // The query already applies the rule; filtering again keeps this list
    // correct even if the query and the rule ever drift apart.
    return { lawsuits: filterOpenForClaims((data ?? []) as Lawsuit[], now), error: false };
  } catch (err) {
    console.error('[lawsuits] catalog query threw:', err instanceof Error ? err.message : err);
    return { lawsuits: [], error: true };
  }
}

/**
 * Settlements open for claims (see lookupLawsuits). Returns an empty list when
 * the database cannot be read; never sample data.
 */
export async function getLawsuits(opts?: CatalogQuery): Promise<Lawsuit[]> {
  return (await lookupLawsuits(opts)).lawsuits;
}

export type LawsuitLookup =
  | { status: 'found'; lawsuit: Lawsuit }
  | { status: 'missing' }
  | { status: 'error' };

/**
 * One public settlement by slug, open or closed. Fictional, unpublished and
 * unknown slugs are 'missing' (their pages 404). Cached per request so the
 * page and its metadata share one query.
 */
export const lookupLawsuitBySlug = cache(async (slug: string): Promise<LawsuitLookup> => {
  if (!slug || isFictionalSlug(slug)) return { status: 'missing' };
  if (!supabaseConfigured()) return { status: 'missing' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lawsuits')
      .select('*')
      .eq('slug', slug)
      .eq('review_status', 'published')
      .maybeSingle();
    if (error) {
      console.error('[lawsuits] settlement lookup failed:', error.message);
      return { status: 'error' };
    }
    const lawsuit = data as Lawsuit | null;
    if (!lawsuit || !isPublicLawsuit(lawsuit)) return { status: 'missing' };
    return { status: 'found', lawsuit };
  } catch (err) {
    console.error('[lawsuits] settlement lookup threw:', err instanceof Error ? err.message : err);
    return { status: 'error' };
  }
});

/**
 * One public settlement by slug, open or closed, or null. Callers that let
 * someone act on it (start a claim) must also check isOpenForClaims.
 */
export async function getLawsuitBySlug(slug: string): Promise<Lawsuit | null> {
  const result = await lookupLawsuitBySlug(slug);
  return result.status === 'found' ? result.lawsuit : null;
}

/** Categories that have at least one settlement open for claims, A to Z. */
export async function getCategories(): Promise<string[]> {
  return categoriesOf(await getLawsuits());
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
