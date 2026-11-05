import { cache } from 'react';
import { createPublicClient } from '@/lib/supabase/server';
import type { Lawsuit } from './types';
import { FICTIONAL_SLUGS, isFictionalSlug } from './fictional-slugs';
import { OPEN_STATUSES, filterOpenForClaims, isOpenForClaims, isPublicLawsuit } from './open-for-claims';
import { todayInLatestUSZone } from './utils';
import {
  categoriesOf,
  cleanSearchTerm,
  displaySummary,
  isSettleSignalRecord,
  officialLinkFor,
  searchCatalog,
  settleSignalPageFor,
} from './lawsuit-display';

// The open-for-claims rule lives in ./open-for-claims (pure, so the claim flow's
// client components share it). Re-exported here for server code.
export { filterOpenForClaims, isOpenForClaims, isPublicLawsuit };

// Link, summary and search helpers live in ./lawsuit-display (pure, so the
// native app shares them). Re-exported here so existing imports keep working.
export {
  categoriesOf,
  cleanSearchTerm,
  displaySummary,
  isSettleSignalRecord,
  officialLinkFor,
  searchCatalog,
  settleSignalPageFor,
};
export type { CatalogLink } from './lawsuit-display';

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

/** Escape LIKE wildcards so a search for "50%" matches the text "50%". */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
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
    const supabase = createPublicClient();
    let query = supabase
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'published')
      .in('status', [...OPEN_STATUSES])
      .or(`deadline.is.null,deadline.gte.${todayInLatestUSZone(now)}`)
      .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`)
      // Known deadlines first (soonest), then rows with no deadline.
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('is_featured', { ascending: false });

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
    const supabase = createPublicClient();
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
 * One settlement by slug, or null. By default only a settlement open for
 * claims (isOpenForClaims), so a caller that lets someone start a claim is
 * safe as is. With { includeClosed: true } it also returns a public settlement
 * that is closed or past its deadline (never a fictional or unpublished one).
 */
export async function getLawsuitBySlug(
  slug: string,
  opts?: { includeClosed?: boolean },
): Promise<Lawsuit | null> {
  const result = await lookupLawsuitBySlug(slug);
  if (result.status !== 'found') return null;
  if (opts?.includeClosed) return result.lawsuit;
  return isOpenForClaims(result.lawsuit) ? result.lawsuit : null;
}

/** Categories that have at least one settlement open for claims, A to Z. */
export async function getCategories(): Promise<string[]> {
  return categoriesOf(await getLawsuits());
}

/**
 * Published, non-fictional listings, open or closed. Used by notice lookup and
 * the recently-closed archive. Never returns sample data.
 */
export async function lookupPublishedLawsuits(): Promise<CatalogResult> {
  if (!supabaseConfigured()) return { lawsuits: [], error: false };
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'published')
      .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error) {
      console.error('[lawsuits] published catalog query failed:', error.message);
      return { lawsuits: [], error: true };
    }
    return {
      lawsuits: ((data ?? []) as Lawsuit[]).filter(isPublicLawsuit),
      error: false,
    };
  } catch (err) {
    console.error(
      '[lawsuits] published catalog query threw:',
      err instanceof Error ? err.message : err,
    );
    return { lawsuits: [], error: true };
  }
}
