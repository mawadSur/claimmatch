import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isOpenForClaims } from '@/lib/lawsuits';
import type { ScrapedLawsuit } from '@/lib/types';
import { getSourceAdapters, type SourceAdapter } from './sources';
import {
  applyCloseBreaker,
  EXISTING_ROW_COLUMNS,
  maxCloseShareFromEnv,
  planIngest,
  type ExistingRow,
} from './plan';

/**
 * Nightly ingest. For each registered source adapter: fetch its records,
 * decide the changes with planIngest (see plan.ts for the rules) and apply
 * them with the service-role client.
 *
 * The fence (Phase 0, S1-1):
 * - Nothing is ever published here. New records wait in 'pending_review'.
 * - No model calls: setting ANTHROPIC_API_KEY changes nothing in this run.
 * - Published rows only take deadline and open/closed status changes from the
 *   source; other differences are logged for a person to check.
 * - An empty or failed fetch changes nothing, and a record missing from the
 *   feed is never closed.
 * - Closures above INGEST_MAX_CLOSE_SHARE (default 20%) of a source's open rows
 *   are held and logged instead of applied.
 *
 * Logs name settlements by slug only; nothing here touches personal data.
 */

export type IngestSummary = {
  /** Feed records read across all sources. */
  ingested: number;
  /** Always 0: the ingest never publishes. Kept for the cron response shape. */
  published: number;
  /** New rows added to the review queue. */
  pending_review: number;
  inserted: number;
  updated: number;
  /** Public rows that stopped being open for claims. */
  closed: number;
  /** Closed rows the source lists as open again. */
  reopened: number;
  deadlineChanges: number;
  /** Published rows whose title or claim link differ from the feed (not changed). */
  flagged: number;
  /** Closures held by the circuit breaker, for a person to review. */
  held: number;
  heldSlugs: string[];
  /** Sources that returned nothing (outage, error or empty feed). */
  emptySources: string[];
  /** Writes or reads that failed. */
  failed: number;
  bySource: Record<string, number>;
};

// External ids run to ~95 characters, so 40 per IN list keeps each request URL
// near 4 KB, well under gateway URL limits.
const IN_CHUNK = 40;
const LOG_LIST_LIMIT = 50;

function emptySummary(): IngestSummary {
  return {
    ingested: 0,
    published: 0,
    pending_review: 0,
    inserted: 0,
    updated: 0,
    closed: 0,
    reopened: 0,
    deadlineChanges: 0,
    flagged: 0,
    held: 0,
    heldSlugs: [],
    emptySources: [],
    failed: 0,
    bySource: {},
  };
}

type Db = ReturnType<typeof createServiceClient>;

export async function ingestAndExtract(): Promise<IngestSummary> {
  const summary = emptySummary();

  // No backend → nothing to persist.
  if (!isSupabaseConfigured()) return summary;

  const supabase = createServiceClient();
  const maxShare = maxCloseShareFromEnv(process.env.INGEST_MAX_CLOSE_SHARE);
  const now = new Date();

  for (const adapter of getSourceAdapters()) {
    summary.bySource[adapter.slug] ??= 0;

    const source = await resolveSource(supabase, adapter);
    if (!source) {
      console.error(`[pipeline] ${adapter.slug}: cannot read or create its sources row; skipped.`);
      summary.failed += 1;
      continue;
    }
    if (!source.enabled) {
      console.log(`[pipeline] ${adapter.slug}: disabled in sources; skipped.`);
      continue;
    }

    let items: ScrapedLawsuit[] = [];
    try {
      items = await adapter.fetch();
    } catch {
      items = [];
    }
    if (items.length === 0) {
      console.warn(`[pipeline] ${adapter.slug}: no records returned; nothing changed.`);
      summary.emptySources.push(adapter.slug);
      continue;
    }
    summary.ingested += items.length;
    summary.bySource[adapter.slug] = items.length;

    const existing = await loadExisting(supabase, items.map((i) => i.external_id));
    if (!existing) {
      console.error(`[pipeline] ${adapter.slug}: cannot read existing rows; nothing changed.`);
      summary.failed += 1;
      continue;
    }

    const planned = planIngest({ items, existing, sourceId: source.id, now });
    const openCount = existing.filter((row) => isOpenForClaims(row, now)).length;
    const { plan, held, allowed } = applyCloseBreaker(planned, { openCount, maxShare });

    if (held.length > 0) {
      summary.held += held.length;
      summary.heldSlugs.push(...held.map((h) => h.slug));
      console.warn(
        `[pipeline] ${adapter.slug}: HELD ${held.length} closures (limit ${allowed} of ${openCount} open rows). ` +
          'Nothing was closed. Review the list, then set INGEST_MAX_CLOSE_SHARE=1 for one run to apply it. ' +
          `Held: ${held
            .slice(0, LOG_LIST_LIMIT)
            .map((h) => `${h.slug} (${h.changes.join('; ')})`)
            .join(', ')}`,
      );
    }
    if (plan.flagged.length > 0) {
      summary.flagged += plan.flagged.length;
      console.log(
        `[pipeline] ${adapter.slug}: ${plan.flagged.length} published rows differ from the feed and were left as they are: ${plan.flagged
          .slice(0, LOG_LIST_LIMIT)
          .map((f) => `${f.slug} (${f.fields.join(', ')})`)
          .join(', ')}`,
      );
    }

    for (const row of plan.inserts) {
      const { error } = await supabase.from('lawsuits').insert(row);
      if (error) {
        console.error(`[pipeline] insert failed for ${row.slug}: ${error.message}`);
        summary.failed += 1;
        continue;
      }
      summary.inserted += 1;
      summary.pending_review += 1;
    }

    for (const update of plan.updates) {
      const { error } = await supabase.from('lawsuits').update(update.patch).eq('id', update.id);
      if (error) {
        console.error(`[pipeline] update failed for ${update.slug}: ${error.message}`);
        summary.failed += 1;
        continue;
      }
      summary.updated += 1;
      if (update.deadlineChange) {
        summary.deadlineChanges += 1;
        console.log(
          `[pipeline] deadline changed for ${update.slug}: ${update.deadlineChange.from ?? 'none'} -> ${update.deadlineChange.to}`,
        );
      }
      if (update.closes) {
        summary.closed += 1;
        console.log(`[pipeline] closed ${update.slug}: ${update.changes.join('; ')}`);
      }
      if (update.reopens) {
        summary.reopened += 1;
        console.log(`[pipeline] reopened ${update.slug}: ${update.changes.join('; ')}`);
      }
    }

    await touchSource(supabase, source.id);
  }

  return summary;
}

/** Existing rows that share an external_id with the feed, or null if they cannot be read. */
async function loadExisting(supabase: Db, externalIds: string[]): Promise<ExistingRow[] | null> {
  const ids = Array.from(new Set(externalIds.filter(Boolean)));
  const rows: ExistingRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from('lawsuits')
      .select(EXISTING_ROW_COLUMNS)
      .in('external_id', chunk);
    if (error) {
      console.error('[pipeline] reading existing rows failed:', error.message);
      return null;
    }
    rows.push(...((data ?? []) as ExistingRow[]));
  }
  return rows;
}

/**
 * The adapter's `sources` row ({ id, enabled }), created when missing. Never
 * re-enables a source an operator disabled. Null when it cannot be read.
 */
async function resolveSource(
  supabase: Db,
  adapter: Pick<SourceAdapter, 'slug' | 'name' | 'homepage'>,
): Promise<{ id: string; enabled: boolean } | null> {
  try {
    const { data: existing, error } = await supabase
      .from('sources')
      .select('id, enabled')
      .eq('slug', adapter.slug)
      .maybeSingle();
    if (error) return null;
    if (existing?.id) {
      return { id: existing.id as string, enabled: existing.enabled !== false };
    }

    const { data: inserted } = await supabase
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
    return inserted?.id
      ? { id: inserted.id as string, enabled: inserted.enabled !== false }
      : null;
  } catch {
    return null;
  }
}

/** Stamp `sources.last_run_at = now()` after a run that read records. */
async function touchSource(supabase: Db, sourceId: string): Promise<void> {
  await supabase
    .from('sources')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', sourceId);
}
