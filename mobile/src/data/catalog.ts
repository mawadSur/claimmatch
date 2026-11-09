import { FICTIONAL_SLUGS, isFictionalSlug } from '@shared/lib/fictional-slugs';
import { isPublicLawsuit, OPEN_STATUSES } from '@shared/lib/open-for-claims';
import {
  applySettlementGuide,
  catalogDeadlineFilter,
  openGuidedCatalog,
  settlementProofDetail,
} from '@shared/lib/settlement-guides';
import { settlementFaqs, type FaqItem } from '@shared/lib/settlement-seo';
import type { Lawsuit } from '@shared/lib/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { now } from '@/lib/clock';
import { getSupabase } from '@/lib/supabase';

import { invalidResponse, supabaseReadError } from './errors';
import { guidesInUse } from './guides';
import { dataKeys } from './keys';
import { parseCatalogRow, parseCatalogRows, type CatalogLawsuit } from './schemas';

export type { CatalogLawsuit } from './schemas';

/**
 * The public catalog, read straight from Supabase under RLS (plan 1.1): the
 * same query, the same official-notice guide overlay and the same
 * open-for-claims re-filter as the web (src/lib/lawsuits.ts lookupLawsuits and
 * lookupLawsuitBySlug). Works signed out. Columns are listed so
 * raw_source_text, reviewed_by and verified_by are never downloaded.
 *
 * The guides are the ones in use (./guides): the server's from GET
 * /api/mobile/config when it has them, otherwise the ones bundled with the
 * app. The shared helpers below (catalogDeadlineFilter, openGuidedCatalog,
 * applySettlementGuide) read them, so the query's guided slugs, the open rule,
 * the order and the settlement screen all follow the server's copy, and
 * ConfigProvider reads these queries again when that copy changes.
 */
export const CATALOG_COLUMNS =
  'id, slug, title, summary, description, category, status, review_status, typical_payout, proof_required, deadline, eligibility, eligibility_text, source_url, claim_url, external_id, is_featured, administrator, verified_at, eligibility_verified, proof_verified';

/** The web's /lawsuits revalidates every 900 s. */
export const CATALOG_STALE_MS = 15 * 60_000;
/** The web's /lawsuits/[slug] revalidates every 3600 s. */
export const SETTLEMENT_STALE_MS = 60 * 60_000;

/** A row with the guides in use applied, and their version. */
export type GuidedRow = CatalogLawsuit & {
  /** guidesInUse().version when the guides were applied. */
  guidesVersion: string;
};

/**
 * A row as the settlement screen shows it. Its proof note and questions come
 * from the same guides as its deadline, payout and link: read from the
 * guides at render time, a guide change would show the new guide's text
 * beside the old guide's facts until the screen is read again, or for as
 * long as that read fails.
 */
export type SettlementRow = GuidedRow & {
  /** settlementProofDetail: the guide's proof sentence, or the listing's. */
  proofNote: string;
  /** settlementFaqs, with the guide's own questions. */
  faqs: FaqItem[];
};

/** Call while the row's guides are the ones in use: right after they are applied, or when its version says so. */
function toSettlementRow(row: GuidedRow): SettlementRow {
  return { ...row, proofNote: settlementProofDetail(row), faqs: settlementFaqs(toLawsuit(row)) };
}

/**
 * Settlements open for claims: soonest known deadline first, then no
 * deadline, featured first within a day. The query applies the open rule
 * (and also reads every guided slug, whatever its feed deadline says); then,
 * with the same clock and as on the web, the guides replace the feed's
 * deadline before filterOpenForClaims applies the rule again and the rows are
 * put in deadline order (openGuidedCatalog).
 */
export async function fetchCatalog(signal?: AbortSignal): Promise<GuidedRow[]> {
  const at = now();
  let query = getSupabase()
    .from('lawsuits')
    .select(CATALOG_COLUMNS)
    .eq('review_status', 'published')
    .in('status', [...OPEN_STATUSES])
    .or(catalogDeadlineFilter(at))
    .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('is_featured', { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query;
  if (error) throw supabaseReadError(error, status);
  const { version } = guidesInUse();
  return openGuidedCatalog(parseCatalogRows(data), at).map((row) => ({ ...row, guidesVersion: version }));
}

export type SettlementLookup =
  | { status: 'found'; lawsuit: SettlementRow }
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
  if (!isPublicLawsuit(lawsuit)) return { status: 'missing', fictional: false };
  return {
    status: 'found',
    lawsuit: toSettlementRow({ ...applySettlementGuide(lawsuit), guidesVersion: guidesInUse().version }),
  };
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
 * the catalog's copy of the row, so the detail screen opens without a
 * spinner, also when the catalog's last refresh failed (offline, a 5xx).
 * Not when that copy was overlaid with other guides than the ones in use
 * (they changed, and the catalog is being read again): the settlement is
 * read itself.
 */
export function useSettlement(slug: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: dataKeys.settlement(slug),
    queryFn: ({ signal }) => fetchSettlementBySlug(slug, signal),
    staleTime: SETTLEMENT_STALE_MS,
    initialData: (): SettlementLookup | undefined => {
      const row = client.getQueryData<GuidedRow[]>(dataKeys.catalog)?.find((lawsuit) => lawsuit.slug === slug);
      return row && row.guidesVersion === guidesInUse().version
        ? { status: 'found', lawsuit: toSettlementRow(row) }
        : undefined;
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
