import type { LawsuitStatus, ReviewStatus } from '@/lib/types';
import { isDeadlinePassed } from '@/lib/utils';
import { isPublicLawsuit, OPEN_STATUSES } from '@/lib/open-for-claims';
import type { IngestPlan, PlannedUpdate } from './plan';

/**
 * Close rules that do not wait for the feed to mark a record closed:
 * 1. The deadline has already passed (America/New_York date — same as isOpenForClaims).
 * 2. A feed-source row has been missing from N consecutive successful,
 *    non-empty feeds.
 *
 * A failed or empty feed must never call {@link planFeedPresence}: that is
 * what keeps a broken night from closing the catalog.
 */

/** Successful feeds a feed-source row may miss before we close it. */
export const DEFAULT_MISSING_FEED_CLOSE_AFTER = 3;

/** Read INGEST_MISSING_FEED_CLOSE_AFTER (an integer 1–30); anything else means 3. */
export function missingFeedCloseAfterFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_MISSING_FEED_CLOSE_AFTER;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : DEFAULT_MISSING_FEED_CLOSE_AFTER;
}

/** Columns the stale planner reads from existing rows. */
export const STALE_CANDIDATE_COLUMNS =
  'id, slug, status, deadline, review_status, source_id, external_id, last_seen_at, missed_feed_count';

export interface StaleCandidate {
  id: string;
  slug: string;
  status: LawsuitStatus;
  deadline: string | null;
  review_status: ReviewStatus;
  source_id: string | null;
  external_id: string | null;
  last_seen_at: string | null;
  missed_feed_count: number;
}

export type StaleReason = 'deadline' | 'missing_from_feed' | 'seen';
export type CloseReason = 'deadline' | 'missing_from_feed' | 'feed_status';

export interface PlannedStaleAction {
  id: string;
  slug: string;
  external_id: string | null;
  deadline: string | null;
  reason: StaleReason;
  close: boolean;
  missed_feed_count: number;
  last_seen_at: string | null;
  patch: Record<string, unknown>;
  changes: string[];
}

export interface WouldCloseRow {
  id: string;
  slug: string;
  reason: CloseReason;
  deadline: string | null;
  missed_feed_count: number | null;
  external_id: string | null;
  changes: string[];
}

function isCloseableStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Published rows still marked open or closing-soon, including past-deadline. */
export function catalogOpenStatusCount(rows: StaleCandidate[]): number {
  return rows.filter((row) => isPublicLawsuit(row) && isCloseableStatus(row.status)).length;
}

/** True when this row came from the adapter's feed (source id or external_id prefix). */
export function isFeedSourceRow(
  row: Pick<StaleCandidate, 'source_id' | 'external_id'>,
  sourceId: string,
  adapterSlug: string,
): boolean {
  if (row.source_id && row.source_id === sourceId) return true;
  return !!row.external_id?.startsWith(`${adapterSlug}:`);
}

/**
 * Open or closing-soon rows whose deadline has already passed. Draft and
 * already-closed rows are left alone. No deadline is not a close.
 */
export function planDeadlineCloses(rows: StaleCandidate[], now: Date): PlannedStaleAction[] {
  const out: PlannedStaleAction[] = [];
  for (const row of rows) {
    if (!isCloseableStatus(row.status)) continue;
    if (!isDeadlinePassed(row.deadline, now)) continue;
    out.push({
      id: row.id,
      slug: row.slug,
      external_id: row.external_id,
      deadline: row.deadline,
      reason: 'deadline',
      close: true,
      missed_feed_count: row.missed_feed_count ?? 0,
      last_seen_at: row.last_seen_at,
      patch: { status: 'closed' },
      changes: [`deadline ${row.deadline} has passed`],
    });
  }
  return out;
}

/**
 * Stamp presence / increment misses for one source after a successful
 * non-empty feed. Returns empty plans when `seenExternalIds` is empty so a
 * caller cannot close the catalog by passing an empty set by mistake.
 */
export function planFeedPresence(args: {
  sourceRows: StaleCandidate[];
  seenExternalIds: Iterable<string>;
  now: Date;
  closeAfter?: number;
  /**
   * When false, increment missed_feed_count but never set status=closed.
   * Used by INGEST_MISSING_CLOSE_QUEUE_ENABLED so a person decides.
   */
  autoCloseMissing?: boolean;
}): { seen: PlannedStaleAction[]; missing: PlannedStaleAction[]; proposeClose: PlannedStaleAction[] } {
  const seenIds = new Set(Array.from(args.seenExternalIds).filter(Boolean));
  if (seenIds.size === 0) return { seen: [], missing: [], proposeClose: [] };

  const closeAfter = args.closeAfter ?? DEFAULT_MISSING_FEED_CLOSE_AFTER;
  const autoCloseMissing = args.autoCloseMissing !== false;
  const seenAt = args.now.toISOString();
  const seen: PlannedStaleAction[] = [];
  const missing: PlannedStaleAction[] = [];
  const proposeClose: PlannedStaleAction[] = [];

  for (const row of args.sourceRows) {
    if (!isCloseableStatus(row.status)) continue;
    const externalId = row.external_id;
    if (externalId && seenIds.has(externalId)) {
      seen.push({
        id: row.id,
        slug: row.slug,
        external_id: row.external_id,
        deadline: row.deadline,
        reason: 'seen',
        close: false,
        missed_feed_count: 0,
        last_seen_at: seenAt,
        patch: { last_seen_at: seenAt, missed_feed_count: 0 },
        changes: ['last_seen_at updated; missed_feed_count reset'],
      });
      continue;
    }

    const previous = row.missed_feed_count ?? 0;
    const nextCount = previous + 1;
    const reached = nextCount >= closeAfter;
    const close = autoCloseMissing && reached;
    const action: PlannedStaleAction = {
      id: row.id,
      slug: row.slug,
      external_id: row.external_id,
      deadline: row.deadline,
      reason: 'missing_from_feed',
      close,
      missed_feed_count: nextCount,
      last_seen_at: row.last_seen_at,
      patch: close
        ? { status: 'closed', missed_feed_count: nextCount }
        : { missed_feed_count: nextCount },
      changes: close
        ? [`missing from ${nextCount} consecutive successful feeds`]
        : reached && !autoCloseMissing
          ? [`missed_feed_count ${previous} -> ${nextCount}; queued for admin close review`]
          : [`missed_feed_count ${previous} -> ${nextCount}`],
    };
    missing.push(action);
    if (reached && !autoCloseMissing) proposeClose.push(action);
  }
  return { seen, missing, proposeClose };
}

export function staleToUpdate(action: PlannedStaleAction): PlannedUpdate {
  return {
    id: action.id,
    slug: action.slug,
    patch: action.patch,
    changes: action.changes,
    closes: action.close,
    reopens: false,
    deadlineChange: null,
    closeReason:
      action.reason === 'deadline'
        ? 'deadline'
        : action.reason === 'missing_from_feed'
          ? 'missing_from_feed'
          : undefined,
  };
}

/**
 * Fold stale actions into an ingest plan. Later actions win on the same id
 * (so a deadline close overrides a miss increment). Seen stamps merge into an
 * existing update instead of replacing it.
 */
export function mergeStaleIntoPlan(plan: IngestPlan, stale: PlannedStaleAction[]): IngestPlan {
  const updates = new Map<string, PlannedUpdate>();
  for (const u of plan.updates) {
    updates.set(u.id, {
      ...u,
      patch: { ...u.patch },
      changes: [...u.changes],
    });
  }
  for (const action of stale) {
    const existing = updates.get(action.id);
    if (existing) {
      existing.patch = { ...existing.patch, ...action.patch };
      existing.changes = [...existing.changes, ...action.changes];
      if (action.close) {
        existing.closes = true;
        existing.closeReason =
          action.reason === 'deadline'
            ? 'deadline'
            : action.reason === 'missing_from_feed'
              ? 'missing_from_feed'
              : existing.closeReason;
      }
    } else {
      updates.set(action.id, staleToUpdate(action));
    }
  }
  return { ...plan, updates: [...updates.values()] };
}

export function wouldCloseFromUpdate(update: PlannedUpdate, extras?: {
  deadline?: string | null;
  external_id?: string | null;
  missed_feed_count?: number | null;
}): WouldCloseRow {
  const reason: CloseReason =
    update.closeReason ??
    (update.changes.some((c) => c.includes('has passed'))
      ? 'deadline'
      : update.changes.some((c) => c.includes('consecutive successful'))
        ? 'missing_from_feed'
        : 'feed_status');
  return {
    id: update.id,
    slug: update.slug,
    reason,
    deadline: extras?.deadline ?? null,
    missed_feed_count: extras?.missed_feed_count ?? null,
    external_id: extras?.external_id ?? null,
    changes: update.changes,
  };
}

/** Human-readable dry-run report. No personal data — slugs only. */
export function formatDryRunReport(args: {
  wouldClose: WouldCloseRow[];
  wouldIncrementMiss: WouldCloseRow[];
  held: WouldCloseRow[];
  closeAfter: number;
}): string {
  const lines: string[] = [];
  const byReason = (reason: CloseReason) => args.wouldClose.filter((r) => r.reason === reason);

  lines.push(`Dry run: would close ${args.wouldClose.length} row(s); hold ${args.held.length}; increment miss count on ${args.wouldIncrementMiss.length} (close after ${args.closeAfter} successful feeds).`);

  for (const reason of ['deadline', 'missing_from_feed', 'feed_status'] as const) {
    const rows = byReason(reason);
    if (rows.length === 0) continue;
    lines.push(`${reason} (${rows.length}):`);
    for (const row of rows) {
      lines.push(`  ${row.slug}  ${row.changes.join('; ')}`);
    }
  }

  if (args.held.length > 0) {
    lines.push(`held by circuit breaker (${args.held.length}):`);
    for (const row of args.held) {
      lines.push(`  ${row.slug}  ${row.changes.join('; ')}`);
    }
  }

  if (args.wouldIncrementMiss.length > 0) {
    lines.push(`would increment missed_feed_count, not yet closing (${args.wouldIncrementMiss.length}):`);
    for (const row of args.wouldIncrementMiss) {
      lines.push(`  ${row.slug}  ${row.changes.join('; ')}`);
    }
  }

  return lines.join('\n');
}
