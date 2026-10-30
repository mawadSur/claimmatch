import { flags } from '@/lib/flags';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isOpenForClaims } from '@/lib/lawsuits';
import type { ScrapedLawsuit } from '@/lib/types';
import { getSourceAdapters, type SourceAdapter } from './sources';
import {
  applyCloseBreaker,
  EXISTING_ROW_COLUMNS,
  heldClosureLogLines,
  maxCloseShareFromEnv,
  planIngest,
  type ExistingRow,
  type HeldClosure,
  type IngestPlan,
  type PlannedUpdate,
} from './plan';
import {
  catalogOpenStatusCount,
  formatDryRunReport,
  isFeedSourceRow,
  mergeStaleIntoPlan,
  missingFeedCloseAfterFromEnv,
  planDeadlineCloses,
  planFeedPresence,
  STALE_CANDIDATE_COLUMNS,
  wouldCloseFromUpdate,
  type StaleCandidate,
  type WouldCloseRow,
} from './stale';

export type { HeldClosure } from './plan';
export type { WouldCloseRow } from './stale';
export { formatDryRunReport } from './stale';

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
 * - An empty or failed fetch changes nothing. A record missing from a
 *   successful non-empty feed increments missed_feed_count; after N
 *   consecutive misses (default 3) the row is closed unless
 *   INGEST_MISSING_CLOSE_QUEUE_ENABLED=1, which queues it for /admin
 *   instead (never auto-closes). Past-deadline rows close even when the
 *   feed is empty or down.
 * - Closures above INGEST_MAX_CLOSE_SHARE (default 20%) of a source's open rows
 *   are held instead of applied. Every held row is logged with its changes and
 *   kept in the summary (heldClosures), which the cron routes store as a run
 *   record and report as a failed step, so a person reviews the whole list
 *   before raising the limit.
 * - INGEST_DRY_RUN=1 (or ingestAndExtract({ dryRun: true })) plans the same
 *   writes and reports which rows would close, then writes nothing.
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
  /** Every held closure with what it would change, for that review. */
  heldClosures: HeldClosure[];
  /** Public rows closed because their deadline has passed. */
  closedByDeadline: number;
  /** Feed-source rows closed after N consecutive successful-feed misses. */
  closedByMissingFeed: number;
  /** Planned closes (applied, or reported only when dryRun). */
  wouldClose: WouldCloseRow[];
  /** Feed-source rows whose miss count would go up but not yet close. */
  wouldIncrementMiss: WouldCloseRow[];
  /** Rows at the miss threshold queued for admin review (flag on; never auto-closed). */
  proposeClose: number;
  proposeCloseSlugs: string[];
  /** True when this run planned writes and applied none. */
  dryRun: boolean;
  /** Sources that returned nothing (outage, error or empty feed). */
  emptySources: string[];
  /** Writes or reads that failed. */
  failed: number;
  bySource: Record<string, number>;
};

export type IngestOptions = {
  /** Plan writes and report them; apply nothing. Also set by INGEST_DRY_RUN=1. */
  dryRun?: boolean;
  now?: Date;
};

// External ids run to ~95 characters, so 40 per IN list keeps each request URL
// near 4 KB, well under gateway URL limits.
const IN_CHUNK = 40;
const LOG_LIST_LIMIT = 50;
/** Parallel catalog writes. Sequential 1-row updates of a ~900-row feed
 *  exceed the Hobby duration cap before recordIngestRun used to run. */
const WRITE_CHUNK = 25;
const EXISTING_FETCH_CONCURRENCY = 5;

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
    heldClosures: [],
    closedByDeadline: 0,
    closedByMissingFeed: 0,
    wouldClose: [],
    wouldIncrementMiss: [],
    proposeClose: 0,
    proposeCloseSlugs: [],
    dryRun: false,
    emptySources: [],
    failed: 0,
    bySource: {},
  };
}

type Db = ReturnType<typeof createServiceClient>;

function envDryRun(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export async function ingestAndExtract(options: IngestOptions = {}): Promise<IngestSummary> {
  const summary = emptySummary();
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? envDryRun(process.env.INGEST_DRY_RUN);
  summary.dryRun = dryRun;

  // No backend → nothing to persist.
  if (!isSupabaseConfigured()) return summary;

  const supabase = createServiceClient();
  const maxShare = maxCloseShareFromEnv(process.env.INGEST_MAX_CLOSE_SHARE);
  const closeAfter = missingFeedCloseAfterFromEnv(process.env.INGEST_MISSING_FEED_CLOSE_AFTER);

  const loadedCloseable = await loadCloseableRows(supabase);
  if (!loadedCloseable) {
    console.error('[pipeline] cannot read open rows; deadline and miss tracking skipped.');
    summary.failed += 1;
  }

  // Deadline closes do not depend on the feed. A down or empty feed still
  // expires rows whose claim window has ended. Those ids are then left out of
  // miss tracking so a single row is not closed twice in one run.
  let remainingCloseable = loadedCloseable;
  if (loadedCloseable) {
    const deadlineActions = planDeadlineCloses(loadedCloseable, now);
    const deadlineIds = new Set(deadlineActions.map((a) => a.id));
    remainingCloseable = loadedCloseable.filter((row) => !deadlineIds.has(row.id));
    const deadlinePlan = mergeStaleIntoPlan(
      { inserts: [], updates: [], flagged: [], skipped: 0 },
      deadlineActions,
    );
    await applyPlanned(supabase, deadlinePlan, {
      summary,
      adapterSlug: 'deadline',
      openCount: catalogOpenStatusCount(loadedCloseable),
      maxShare,
      dryRun,
      extrasById: extrasFromCandidates(loadedCloseable),
    });
  }

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
      // Failed or empty feed: change nothing for absence. Deadline closes
      // already ran above.
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

    let planned = planIngest({ items, existing, sourceId: source.id, now });

    // Presence tracking only after a successful non-empty fetch.
    if (remainingCloseable) {
      const sourceRows = remainingCloseable.filter((row) => isFeedSourceRow(row, source.id, adapter.slug));
      const queueMissing = flags.missingCloseQueue();
      const presence = planFeedPresence({
        sourceRows,
        seenExternalIds: items.map((i) => i.external_id),
        now,
        closeAfter,
        autoCloseMissing: !queueMissing,
      });
      planned = mergeStaleIntoPlan(planned, [...presence.seen, ...presence.missing]);
      if (presence.proposeClose.length > 0) {
        summary.proposeClose += presence.proposeClose.length;
        summary.proposeCloseSlugs.push(...presence.proposeClose.map((row) => row.slug));
      }
    }

    const openCount = remainingCloseable
      ? remainingCloseable.filter(
          (row) => isFeedSourceRow(row, source.id, adapter.slug) && isOpenForClaims(row, now),
        ).length
      : existing.filter((row) => isOpenForClaims(row, now)).length;
    await applyPlanned(supabase, planned, {
      summary,
      adapterSlug: adapter.slug,
      openCount,
      maxShare,
      dryRun,
      extrasById: extrasFromCandidates([
        ...existingAsCandidates(existing),
        ...(remainingCloseable ?? []),
      ]),
    });

    if (!dryRun) await touchSource(supabase, source.id);
  }

  if (dryRun) {
    console.log(
      formatDryRunReport({
        wouldClose: summary.wouldClose,
        wouldIncrementMiss: summary.wouldIncrementMiss,
        held: summary.heldClosures.map((h) => ({
          id: '',
          slug: h.slug,
          reason: 'feed_status',
          deadline: null,
          missed_feed_count: null,
          external_id: null,
          changes: h.changes,
        })),
        closeAfter,
      }),
    );
  }

  return summary;
}

type UpdateExtras = Pick<WouldCloseRow, 'deadline' | 'external_id' | 'missed_feed_count'>;

function extrasFromCandidates(rows: StaleCandidate[]): Map<string, UpdateExtras> {
  const map = new Map<string, UpdateExtras>();
  for (const row of rows) {
    map.set(row.id, {
      deadline: row.deadline,
      external_id: row.external_id,
      missed_feed_count: row.missed_feed_count ?? 0,
    });
  }
  return map;
}

function existingAsCandidates(rows: ExistingRow[]): StaleCandidate[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    deadline: row.deadline,
    review_status: row.review_status,
    source_id: null,
    external_id: row.external_id,
    last_seen_at: null,
    missed_feed_count: 0,
  }));
}

async function applyPlanned(
  supabase: Db,
  planned: IngestPlan,
  opts: {
    summary: IngestSummary;
    adapterSlug: string;
    openCount: number;
    maxShare: number;
    dryRun: boolean;
    extrasById: Map<string, UpdateExtras>;
  },
): Promise<void> {
  const { summary, adapterSlug, openCount, maxShare, dryRun, extrasById } = opts;
  const { plan, held, allowed } = applyCloseBreaker(planned, { openCount, maxShare });

  if (held.length > 0) {
    summary.held += held.length;
    summary.heldSlugs.push(...held.map((h) => h.slug));
    summary.heldClosures.push(
      ...held.map((h) => ({
        source: adapterSlug,
        slug: h.slug,
        changes: h.changes,
        id: h.id,
        patch: h.patch,
        closeReason: h.closeReason,
      })),
    );
    for (const line of heldClosureLogLines(adapterSlug, held, { allowed, openCount })) {
      console.warn(line);
    }
  }
  if (plan.flagged.length > 0) {
    summary.flagged += plan.flagged.length;
    console.log(
      `[pipeline] ${adapterSlug}: ${plan.flagged.length} published rows differ from the feed and were left as they are: ${plan.flagged
        .slice(0, LOG_LIST_LIMIT)
        .map((f) => `${f.slug} (${f.fields.join(', ')})`)
        .join(', ')}`,
    );
  }

  for (let i = 0; i < plan.inserts.length; i += WRITE_CHUNK) {
    const chunk = plan.inserts.slice(i, i + WRITE_CHUNK);
    if (dryRun) {
      summary.inserted += chunk.length;
      summary.pending_review += chunk.length;
      continue;
    }
    const results = await Promise.all(
      chunk.map(async (row) => {
        const { error } = await supabase.from('lawsuits').insert(row);
        return { row, error };
      }),
    );
    for (const { row, error } of results) {
      if (error) {
        console.error(`[pipeline] insert failed for ${row.slug}: ${error.message}`);
        summary.failed += 1;
        continue;
      }
      summary.inserted += 1;
      summary.pending_review += 1;
    }
  }

  for (let i = 0; i < plan.updates.length; i += WRITE_CHUNK) {
    const chunk = plan.updates.slice(i, i + WRITE_CHUNK);
    if (dryRun) {
      for (const update of chunk) {
        summary.updated += 1;
        recordPlannedUpdate(summary, update, extrasById.get(update.id));
      }
      continue;
    }
    const results = await Promise.all(
      chunk.map(async (update) => {
        const { error } = await supabase.from('lawsuits').update(update.patch).eq('id', update.id);
        return { update, error };
      }),
    );
    for (const { update, error } of results) {
      if (error) {
        console.error(`[pipeline] update failed for ${update.slug}: ${error.message}`);
        summary.failed += 1;
        continue;
      }
      if (update.deadlineChange) {
        console.log(
          `[pipeline] deadline changed for ${update.slug}: ${update.deadlineChange.from ?? 'none'} -> ${update.deadlineChange.to}`,
        );
      }
      if (update.closes) {
        console.log(`[pipeline] closed ${update.slug}: ${update.changes.join('; ')}`);
      }
      if (update.reopens) {
        console.log(`[pipeline] reopened ${update.slug}: ${update.changes.join('; ')}`);
      }
      summary.updated += 1;
      recordPlannedUpdate(summary, update, extrasById.get(update.id));
    }
  }
}

function recordPlannedUpdate(
  summary: IngestSummary,
  update: PlannedUpdate,
  extras?: UpdateExtras,
): void {
  if (update.deadlineChange) summary.deadlineChanges += 1;
  if (update.reopens) summary.reopened += 1;
  if (update.closes) {
    const row = wouldCloseFromUpdate(update, extras);
    summary.closed += 1;
    if (row.reason === 'deadline') summary.closedByDeadline += 1;
    if (row.reason === 'missing_from_feed') summary.closedByMissingFeed += 1;
    summary.wouldClose.push(row);
    return;
  }
  if (update.changes.some((c) => c.startsWith('missed_feed_count '))) {
    summary.wouldIncrementMiss.push(wouldCloseFromUpdate(update, extras));
  }
}

/** Open or closing-soon rows, or null if they cannot be read. */
async function loadCloseableRows(supabase: Db): Promise<StaleCandidate[] | null> {
  const rows: StaleCandidate[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('lawsuits')
      .select(STALE_CANDIDATE_COLUMNS)
      .in('status', ['open', 'closing_soon'])
      .range(from, from + page - 1);
    if (error) {
      console.error('[pipeline] reading open rows failed:', error.message);
      return null;
    }
    rows.push(...((data ?? []) as StaleCandidate[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

/** Existing rows that share an external_id with the feed, or null if they cannot be read. */
async function loadExisting(supabase: Db, externalIds: string[]): Promise<ExistingRow[] | null> {
  const ids = Array.from(new Set(externalIds.filter(Boolean)));
  const rows: ExistingRow[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    chunks.push(ids.slice(i, i + IN_CHUNK));
  }
  for (let i = 0; i < chunks.length; i += EXISTING_FETCH_CONCURRENCY) {
    const batch = chunks.slice(i, i + EXISTING_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk) =>
        supabase.from('lawsuits').select(EXISTING_ROW_COLUMNS).in('external_id', chunk),
      ),
    );
    for (const { data, error } of results) {
      if (error) {
        console.error('[pipeline] reading existing rows failed:', error.message);
        return null;
      }
      rows.push(...((data ?? []) as ExistingRow[]));
    }
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
