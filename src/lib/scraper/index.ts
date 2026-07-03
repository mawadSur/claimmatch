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
  bySource: Record<string, number>;
}

export async function runAllSources(): Promise<RunSummary> {
  const summary: RunSummary = { inserted: 0, updated: 0, bySource: {} };

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
    }));

    // 4) Dedupe within the batch by slug (last-wins). A single upsert cannot
    //    touch the same conflict target twice, so duplicate slugs from an
    //    adapter would otherwise error out the whole source's batch.
    const bySlug = new Map<string, (typeof rows)[number]>();
    for (const r of rows) bySlug.set(r.slug, r);
    const uniqueRows = [...bySlug.values()];

    // 5) Count inserts vs updates by pre-checking which slugs already exist.
    const slugs = uniqueRows.map((r) => r.slug);
    const { data: existing } = await supabase
      .from('lawsuits')
      .select('slug')
      .in('slug', slugs);
    const existingSlugs = new Set(
      (existing ?? []).map((r: { slug: string }) => r.slug),
    );
    const insertedForSource = slugs.filter((s) => !existingSlugs.has(s)).length;

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
