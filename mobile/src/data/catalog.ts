import { FICTIONAL_SLUGS, isFictionalSlug } from '@shared/lib/fictional-slugs';
import { filterOpenForClaims, isPublicLawsuit, OPEN_STATUSES } from '@shared/lib/open-for-claims';
import type { Lawsuit } from '@shared/lib/types';
import { todayInDeadlineZone } from '@shared/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { now } from '@/lib/clock';
import { getSupabase } from '@/lib/supabase';

import { invalidResponse, supabaseReadError } from './errors';
import { dataKeys } from './keys';
import { parseCatalogRow, parseCatalogRows, type CatalogLawsuit } from './schemas';

export type { CatalogLawsuit } from './schemas';

/**
 * The public catalog, read straight from Supabase under RLS (plan 1.1): the
 * same query and the same open-for-claims re-filter as the web
 * (src/lib/lawsuits.ts lookupLawsuits and lookupLawsuitBySlug). Works signed
 * out. Columns are listed so raw_source_text, reviewed_by and verified_by are
 * never downloaded.
 */
export const CATALOG_COLUMNS =
  'id, slug, title, summary, description, category, status, review_status, typical_payout, proof_required, deadline, eligibility, eligibility_text, source_url, claim_url, external_id, is_featured, administrator, verified_at, eligibility_verified, proof_verified';

/** The web's /lawsuits revalidates every 900 s. */
export const CATALOG_STALE_MS = 15 * 60_000;
/** The web's /lawsuits/[slug] revalidates every 3600 s. */
export const SETTLEMENT_STALE_MS = 60 * 60_000;

/**
 * Settlements open for claims: soonest known deadline first, then no
 * deadline, featured first within a day. The query applies the open rule and
 * filterOpenForClaims applies it again with the same clock, as on the web.
 */
export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogLawsuit[]> {
  const at = now();
  let query = getSupabase()
    .from('lawsuits')
    .select(CATALOG_COLUMNS)
    .eq('review_status', 'published')
    .in('status', [...OPEN_STATUSES])
    .or(`deadline.is.null,deadline.gte.${todayInDeadlineZone(at)}`)
    .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('is_featured', { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query;
  if (error) throw supabaseReadError(error, status);
  return filterOpenForClaims(parseCatalogRows(data), at);
}

export type SettlementLookup =
  | { status: 'found'; lawsuit: CatalogLawsuit }
  /** Unknown, unpublished or fictional. `fictional` picks the not-found copy (src/app/lawsuits/[slug]/not-found.tsx). */
  | { status: 'missing'; fictional: boolean };

/**
 * One public settlement by slug, open or closed (lookupLawsuitBySlug).
 * Fictional slugs are never requested. Throws ApiRequestError when the read
 * fails or the row cannot be read.
 */
export async function fetchSettlementBySlug(slug: string, signal?: AbortSignal): Promise<SettlementLookup> {
  if (!slug || isFictionalSlug(slug)) return { status: 'missing', fictional: isFictionalSlug(slug) };
  let query = getSupabase()
    .from('lawsuits')
    .select(CATALOG_COLUMNS)
    .eq('slug', slug)
    .eq('review_status', 'published');
  if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query.maybeSingle();
  if (error) throw supabaseReadError(error, status);
  if (data == null) return { status: 'missing', fictional: false };
  const lawsuit = parseCatalogRow(data);
  if (!lawsuit) throw invalidResponse(status);
  return isPublicLawsuit(lawsuit) ? { status: 'found', lawsuit } : { status: 'missing', fictional: false };
}

/** The open catalog (key ['catalog'], 15 minutes fresh). Errors are ApiRequestError. */
export function useCatalog() {
  return useQuery({
    queryKey: dataKeys.catalog,
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: CATALOG_STALE_MS,
  });
}

/**
 * One settlement (key ['settlement', slug], 60 minutes fresh). Starts from
 * the catalog's copy of the row when the catalog is loaded, so the detail
 * screen opens without a spinner.
 */
export function useSettlement(slug: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: dataKeys.settlement(slug),
    queryFn: ({ signal }) => fetchSettlementBySlug(slug, signal),
    staleTime: SETTLEMENT_STALE_MS,
    initialData: (): SettlementLookup | undefined => {
      const row = client.getQueryData<CatalogLawsuit[]>(dataKeys.catalog)?.find((lawsuit) => lawsuit.slug === slug);
      return row ? { status: 'found', lawsuit: row } : undefined;
    },
    initialDataUpdatedAt: () => client.getQueryState(dataKeys.catalog)?.dataUpdatedAt,
  });
}

/** Columns the catalog does not read, as "not stored" values. */
const NOT_READ: Omit<Lawsuit, keyof CatalogLawsuit> = {
  payout_min: null,
  payout_max: null,
  source_id: null,
  hero_image_url: null,
  extraction_confidence: null,
  raw_source_text: null,
  estimated_value_min: null,
  estimated_value_max: null,
  reviewed_by: null,
  reviewed_at: null,
  last_seen_at: null,
  missed_feed_count: 0,
  created_at: '',
  updated_at: '',
};

/**
 * A catalog row as the full Lawsuit type, for shared helpers typed with
 * Lawsuit that read only catalog columns (settlementAnswerFacts,
 * settlementFaqs). Columns the app never reads are null or empty.
 */
export function toLawsuit(row: CatalogLawsuit): Lawsuit {
  return { ...NOT_READ, ...row };
}
