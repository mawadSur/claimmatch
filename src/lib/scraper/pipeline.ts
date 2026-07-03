import { slugify } from '@/lib/utils';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { anthropicConfigured, extractLawsuit } from '@/lib/anthropic';
import { SOURCE_ADAPTERS } from './sources';
import type { ScrapedLawsuit } from '@/lib/types';

/**
 * LLM extraction pipeline. Walks every registered source adapter, fetches its
 * raw listings, and (when Claude is configured) runs each item through
 * {@link extractLawsuit} to produce a clean, structured settlement record with a
 * confidence score.
 *
 * Review gating: high-confidence extractions (>= 0.8) publish straight to the
 * public catalog; everything else — no LLM, a failed call, or a low-confidence
 * result — lands in `pending_review` so a human vets it before it goes live.
 *
 * Fully degradable: with no Supabase configured it returns zeros, adapters that
 * throw are treated as empty, and a failure on any single item is swallowed so
 * the rest of the batch still ingests.
 */

// A `type` (not `interface`) so it carries an implicit index signature and is
// assignable to `Record<string, unknown>` for completeJob(job.id, summary).
export type IngestSummary = {
  ingested: number;
  published: number;
  pending_review: number;
  bySource: Record<string, number>;
};

/** How much of the raw source text we retain for auditing/human review. */
const RAW_TEXT_LIMIT = 4000;
/** Confidence at or above which an extraction auto-publishes. */
const PUBLISH_THRESHOLD = 0.8;

/**
 * A candidate row destined for the `lawsuits` table. Loosely typed because it
 * carries the dream-state provenance columns (review_status, administrator, …)
 * on top of the base scraped fields.
 */
type LawsuitRow = Record<string, unknown> & {
  slug: string;
  external_id: string | null;
  review_status: 'published' | 'pending_review';
};

export async function ingestAndExtract(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    ingested: 0,
    published: 0,
    pending_review: 0,
    bySource: {},
  };

  // No backend → nothing to persist. (createServiceClient would build a client
  // against a placeholder URL and fail on first write.)
  if (!isSupabaseConfigured()) return summary;

  const supabase = createServiceClient();
  const llmOn = anthropicConfigured();

  for (const adapter of SOURCE_ADAPTERS) {
    summary.bySource[adapter.slug] ??= 0;

    // Resolve the provenance `sources` row so upserts can key on
    // (source_id, external_id). Failure is non-fatal: we fall back to slug.
    const sourceId = await resolveSourceId(supabase, adapter);

    // Adapters must not throw, but guard defensively.
    let items: ScrapedLawsuit[] = [];
    try {
      items = await adapter.fetch();
    } catch {
      items = [];
    }

    for (const item of items) {
      try {
        const row = await buildRow(item, sourceId, llmOn);

        // Never clobber a human decision: if a row for this item already exists
        // and an admin has vetted it (published/rejected, or reviewed_at set),
        // refresh only content columns and leave review_status/status/reviewed_*
        // untouched. Otherwise upsert the full row (new or still-pending).
        const existing = await findExisting(supabase, sourceId, row);
        if (existing && existing.locked) {
          const { error } = await supabase
            .from('lawsuits')
            .update(contentOnly(row))
            .eq('id', existing.id);
          if (error) {
            console.error(`[pipeline] content update failed for ${row.slug}:`, error);
            continue;
          }
          summary.ingested += 1;
          summary.bySource[adapter.slug] += 1;
          continue; // its published/pending disposition is unchanged
        }

        // Prefer the provenance key; fall back to slug when the DB can't
        // arbiter the partial (source_id, external_id) unique index.
        let { error } = await supabase
          .from('lawsuits')
          .upsert(row, { onConflict: 'source_id,external_id' });
        if (error) {
          ({ error } = await supabase
            .from('lawsuits')
            .upsert(row, { onConflict: 'slug' }));
        }
        if (error) {
          console.error(`[pipeline] upsert failed for ${row.slug}:`, error);
          continue;
        }

        summary.ingested += 1;
        summary.bySource[adapter.slug] += 1;
        if (row.review_status === 'published') summary.published += 1;
        else summary.pending_review += 1;
      } catch (err) {
        console.error(`[pipeline] item failed for ${adapter.slug}:`, err);
      }
    }
  }

  return summary;
}

/**
 * Build a single `lawsuits` row from a scraped item, overlaying the LLM
 * extraction when it succeeds.
 */
async function buildRow(
  item: ScrapedLawsuit,
  sourceId: string | null,
  llmOn: boolean,
): Promise<LawsuitRow> {
  // Base record from the adapter's structured fields.
  let title = item.title;
  let summary: string | null = item.summary ?? null;
  let description: string | null = item.description ?? null;
  let category = item.category ?? 'General';
  let administrator: string | null = null;
  let typical_payout: string | null = item.typical_payout ?? 'Varies';
  let estimated_value_min: number | null = null;
  let estimated_value_max: number | null = null;
  let proof_required: boolean = item.proof_required ?? false;
  let deadline: string | null = item.deadline ?? null;
  let eligibility: unknown = item.eligibility ?? {};
  let eligibility_text: string | null = item.eligibility_text ?? null;
  let claim_url: string | null = item.claim_url ?? null;
  let confidence: number | null = null;

  // Text handed to the LLM (and retained for human review).
  const rawText = item.description || item.summary || item.title || '';

  if (llmOn && rawText) {
    const extracted = await extractLawsuit(rawText);
    if (extracted) {
      // Overlay extracted fields, keeping the adapter's value as a fallback so
      // a sparse extraction never blanks out good scraped data.
      title = extracted.title || title;
      summary = extracted.summary ?? summary;
      description = extracted.description ?? description;
      category = extracted.category || category;
      administrator = extracted.administrator ?? administrator;
      typical_payout = extracted.typical_payout ?? typical_payout;
      estimated_value_min = extracted.estimated_value_min ?? estimated_value_min;
      estimated_value_max = extracted.estimated_value_max ?? estimated_value_max;
      proof_required = extracted.proof_required ?? proof_required;
      deadline = extracted.deadline ?? deadline;
      eligibility = extracted.eligibility ?? eligibility;
      eligibility_text = extracted.eligibility_text ?? eligibility_text;
      claim_url = extracted.claim_url ?? claim_url;
      confidence = extracted.confidence;
    }
  }

  // No LLM / failed call / low confidence → route to human review.
  const review_status: LawsuitRow['review_status'] =
    confidence !== null && confidence >= PUBLISH_THRESHOLD
      ? 'published'
      : 'pending_review';

  return {
    slug: slugify(title),
    title,
    summary,
    description,
    category,
    administrator,
    typical_payout,
    estimated_value_min,
    estimated_value_max,
    proof_required,
    deadline,
    eligibility,
    eligibility_text,
    source_id: sourceId,
    source_url: item.source_url ?? null,
    claim_url,
    external_id: item.external_id ?? null,
    raw_source_text: rawText.slice(0, RAW_TEXT_LIMIT),
    extraction_confidence: confidence,
    review_status,
    status: 'open',
  };
}

/** Content columns safe to refresh on re-scrape (never the review/lifecycle
 * columns a human owns: review_status, status, reviewed_by, reviewed_at, slug,
 * source_id, external_id). */
function contentOnly(row: LawsuitRow): Record<string, unknown> {
  const keep = [
    'title', 'summary', 'description', 'category', 'administrator',
    'typical_payout', 'estimated_value_min', 'estimated_value_max',
    'proof_required', 'deadline', 'eligibility', 'eligibility_text',
    'source_url', 'claim_url', 'raw_source_text', 'extraction_confidence',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in row) out[k] = row[k];
  return out;
}

/**
 * Find an existing lawsuit for this scraped item and report whether it is
 * "locked" (a human has vetted it, so review columns must not be overwritten).
 * Matches on (source_id, external_id) when available, else on slug.
 */
async function findExisting(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: string | null,
  row: LawsuitRow,
): Promise<{ id: string; locked: boolean } | null> {
  try {
    let q = supabase.from('lawsuits').select('id, review_status, reviewed_at');
    if (sourceId && row.external_id) {
      q = q.eq('source_id', sourceId).eq('external_id', row.external_id);
    } else {
      q = q.eq('slug', row.slug);
    }
    const { data } = await q.maybeSingle();
    if (!data) return null;
    const rs = (data as { review_status?: string }).review_status;
    const reviewedAt = (data as { reviewed_at?: string | null }).reviewed_at;
    const locked = rs === 'published' || rs === 'rejected' || !!reviewedAt;
    return { id: (data as { id: string }).id, locked };
  } catch {
    return null;
  }
}

/**
 * Ensure a `sources` row exists for an adapter and return its id. Never
 * re-enables an operator-disabled source; returns null when the table can't be
 * read/written (RLS / anon key) so the caller falls back to slug-keyed upserts.
 */
async function resolveSourceId(
  supabase: ReturnType<typeof createServiceClient>,
  adapter: { slug: string; name: string; homepage?: string },
): Promise<string | null> {
  try {
    const { data: existing, error } = await supabase
      .from('sources')
      .select('id')
      .eq('slug', adapter.slug)
      .maybeSingle();
    if (error) return null;
    if (existing?.id) return existing.id as string;

    const { data: inserted } = await supabase
      .from('sources')
      .insert({
        slug: adapter.slug,
        name: adapter.name,
        homepage_url: adapter.homepage ?? null,
        adapter: adapter.slug,
        enabled: true,
      })
      .select('id')
      .maybeSingle();
    return (inserted?.id as string) ?? null;
  } catch {
    return null;
  }
}
