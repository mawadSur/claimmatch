import { slugify } from '@/lib/utils';
import { createServiceClient } from '@/lib/supabase/server';
import type { ScrapedLawsuit } from '@/lib/types';
import { SOURCE_ADAPTERS } from './sources';

/**
 * Scraper orchestrator. Walks every registered {@link SOURCE_ADAPTERS} adapter,
 * ensures a `sources` row exists, fetches + normalizes its listings, and upserts
 * them into `lawsuits`. Uses the service-role client so it can write past RLS.
 *
 * Safe to call in any environment: with no Supabase URL configured it returns
 * zeros, and individual adapters/queries that fail are skipped rather than
 * aborting the whole run.
 */
export interface RunSummary {
  inserted: number;
  updated: number;
  /** Rows written with review_status='pending_review' (awaiting human review). */
  pending_review: number;
  /** Rows left published (a human already vetted them; preserved on refresh). */
  published: number;
  bySource: Record<string, number>;
}

export async function runAllSources(): Promise<RunSummary> {
  const summary: RunSummary = {
    inserted: 0,
    updated: 0,
    pending_review: 0,
    published: 0,
    bySource: {},
  };

  // No backend configured → nothing to do. (createServiceClient would build a
  // client with an undefined URL and throw on first use.)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return summary;

  const supabase = createServiceClient();

  for (const adapter of SOURCE_ADAPTERS) {
    // 1) Ensure the source is registered — but never re-enable a source an
    //    operator disabled. Select first; insert only when missing (enabled=true
    //    is the default for a brand-new source).
    let { data: sourceRow, error: sourceErr } = await supabase
      .from('sources')
      .select('id, enabled')
      .eq('slug', adapter.slug)
      .maybeSingle();

    if (!sourceErr && !sourceRow) {
      const inserted = await supabase
        .from('sources')
        .insert({
          slug: adapter.slug,
          name: adapter.name,
          homepage_url: adapter.homepage ?? null,
          adapter: adapter.slug,
          enabled: true,
        })
        .select('id, enabled')
        .maybeSingle();
      sourceRow = inserted.data;
      sourceErr = inserted.error;
    }

    // Can't read/write sources (e.g. anon key / RLS) → skip this adapter.
    if (sourceErr || !sourceRow) continue;
    // Respect a source disabled in the DB.
    if (sourceRow.enabled === false) continue;

    const sourceId = sourceRow.id as string;

    // 2) Fetch + normalize. Adapters must not throw, but guard defensively.
    let items: ScrapedLawsuit[] = [];
    try {
      items = await adapter.fetch();
    } catch {
      items = [];
    }

    if (items.length === 0) {
      summary.bySource[adapter.slug] = 0;
      await touchSource(supabase, sourceId);
      continue;
    }

    // 3) Map ScrapedLawsuit → lawsuits row (all rows share the same key set so
    //    PostgREST accepts the bulk upsert).
    //
    //    This is the NON-LLM path: rows carry only the adapter's structured
    //    fields, with no confidence signal. They must NOT auto-publish — the
    //    `lawsuits.review_status` column defaults to 'published', so we set it
    //    explicitly to 'pending_review' and record a low/neutral
    //    extraction_confidence, mirroring pipeline.ts's gating philosophy. A
    //    human vets each row before it reaches the public catalog.
    const rows = items.map((item) => ({
      slug: slugify(item.title),
      title: item.title,
      summary: item.summary ?? null,
      description: item.description ?? null,
      category: item.category ?? 'General',
      typical_payout: item.typical_payout ?? 'Varies',
      proof_required: item.proof_required ?? false,
      deadline: item.deadline ?? null,
      eligibility: item.eligibility ?? {},
      eligibility_text: item.eligibility_text ?? null,
      source_id: sourceId,
      source_url: item.source_url ?? null,
      claim_url: item.claim_url ?? null,
      external_id: item.external_id,
      status: 'open',
      // Gate: never auto-publish an un-reviewed, un-scored scrape.
      review_status: 'pending_review',
      extraction_confidence: 0,
    }));

    // 4) Dedupe within the batch by slug (last-wins). A single upsert cannot
    //    touch the same conflict target twice, so duplicate slugs from an
    //    adapter would otherwise error out the whole source's batch.
    const bySlug = new Map<string, (typeof rows)[number]>();
    for (const r of rows) bySlug.set(r.slug, r);
    const uniqueRows = [...bySlug.values()];

    // 5) Count inserts vs updates by pre-checking which slugs already exist,
    //    and — mirroring pipeline.ts — never clobber a human decision. If a row
    //    was already published/rejected or has been reviewed, we preserve its
    //    review_status + extraction_confidence on this refresh instead of
    //    resetting it to pending_review.
    const slugs = uniqueRows.map((r) => r.slug);
    const { data: existing } = await supabase
      .from('lawsuits')
      .select('slug, review_status, extraction_confidence, reviewed_at')
      .in('slug', slugs);
    type ExistingRow = {
      slug: string;
      review_status?: string | null;
      extraction_confidence?: number | null;
      reviewed_at?: string | null;
    };
    const existingBySlug = new Map<string, ExistingRow>(
      (existing ?? []).map((r: ExistingRow) => [r.slug, r] as [string, ExistingRow]),
    );
    const insertedForSource = slugs.filter((s) => !existingBySlug.has(s)).length;

    for (const row of uniqueRows) {
      const prior = existingBySlug.get(row.slug);
      const locked =
        prior &&
        (prior.review_status === 'published' ||
          prior.review_status === 'rejected' ||
          !!prior.reviewed_at);
      if (locked && prior) {
        // Keep the human's disposition; only the content columns refresh.
        row.review_status = prior.review_status ?? row.review_status;
        row.extraction_confidence =
          prior.extraction_confidence ?? row.extraction_confidence;
      }
    }

    // 6) Upsert. Prefer the provenance key (source_id, external_id); fall back
    //    to slug if the DB lacks that exact conflict target (it is a PARTIAL
    //    unique index, which PostgREST's on_conflict can't always arbiter).
    let { error: upErr } = await supabase
      .from('lawsuits')
      .upsert(uniqueRows, { onConflict: 'source_id,external_id' });
    if (upErr) {
      ({ error: upErr } = await supabase
        .from('lawsuits')
        .upsert(uniqueRows, { onConflict: 'slug' }));
    }

    if (upErr) {
      summary.bySource[adapter.slug] = 0;
    } else {
      summary.inserted += insertedForSource;
      summary.updated += uniqueRows.length - insertedForSource;
      summary.bySource[adapter.slug] = uniqueRows.length;
      // Review-gate breakdown: new/un-vetted rows are pending_review; only rows
      // a human already published stay published (see preservation loop above).
      for (const row of uniqueRows) {
        if (row.review_status === 'published') summary.published += 1;
        else summary.pending_review += 1;
      }
    }

    // 6) Record the run.
    await touchSource(supabase, sourceId);
  }

  return summary;
}

/** Stamp `sources.last_run_at = now()` for a source id. */
async function touchSource(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: string,
): Promise<void> {
  await supabase
    .from('sources')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', sourceId);
}
