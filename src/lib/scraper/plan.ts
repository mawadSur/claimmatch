import type {
  LawsuitStatus,
  ReviewStatus,
  ScrapedLawsuit,
} from '@/lib/types';
import { isOpenForClaims } from '@/lib/lawsuits';
import { isFictionalSlug } from '@/lib/fictional-slugs';
import { isDeadlinePassed, slugify } from '@/lib/utils';

/**
 * Pure decision logic for the nightly ingest (no database, no network).
 *
 * Rules (Phase 0 ingest fence, S1-1):
 * - Ingest never publishes. A new record becomes a row in 'pending_review'
 *   for a person to check, and only when the source says it is open for
 *   claims and its deadline has not passed.
 * - A row a person has handled (published, rejected or reviewed) is
 *   "locked": a refresh may change only its deadline and its open/closed
 *   status, as the source states them. Other differences are flagged for a
 *   person and left alone.
 * - Rows nobody has reviewed yet follow the feed.
 * - A record missing from this fetch changes nothing *here*. The stale
 *   planner (stale.ts) increments missed_feed_count on a successful
 *   non-empty feed and closes the row after N consecutive misses; a failed
 *   or empty feed never does that. Only an explicit closed status or a new
 *   deadline that has passed can close a row in this file, and a closed row
 *   reopens when the source lists it as open again.
 * - A circuit breaker holds a run's closures when they exceed a set share of
 *   the open catalog, so a broken or reshaped feed cannot empty the site.
 */

/** Columns the ingest reads from existing rows. */
export const EXISTING_ROW_COLUMNS =
  'id, slug, external_id, status, deadline, review_status, reviewed_at, title, claim_url';

export interface ExistingRow {
  id: string;
  slug: string;
  external_id: string | null;
  status: LawsuitStatus;
  deadline: string | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  title: string;
  claim_url: string | null;
}

/** A new row for the review queue. Every money estimate stays empty: we never invent amounts. */
export interface NewRow {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  typical_payout: string | null;
  proof_required: boolean;
  deadline: string | null;
  eligibility: Record<string, unknown>;
  eligibility_text: string | null;
  source_id: string;
  source_url: string | null;
  claim_url: string | null;
  external_id: string;
  raw_source_text: string;
  administrator: null;
  extraction_confidence: null;
  estimated_value_min: null;
  estimated_value_max: null;
  review_status: 'pending_review';
  status: 'open';
  last_seen_at: string;
  missed_feed_count: 0;
}

export interface PlannedUpdate {
  id: string;
  slug: string;
  patch: Record<string, unknown>;
  /** What changes, in words, for the log (no personal data). */
  changes: string[];
  /** The row is published and open for claims now and would not be after this update. */
  closes: boolean;
  /** The row was closed and the source lists it as open again. */
  reopens: boolean;
  deadlineChange: { from: string | null; to: string } | null;
  /** Why this update would close a public row. Unset when it does not close. */
  closeReason?: 'deadline' | 'missing_from_feed' | 'feed_status';
}

export interface IngestPlan {
  inserts: NewRow[];
  updates: PlannedUpdate[];
  /** Locked rows whose title or claim link differ from the feed: for a person to check. */
  flagged: { slug: string; fields: string[] }[];
  /** Feed records not added: not open for claims, past their deadline, or a duplicate or fictional slug. */
  skipped: number;
}

const RAW_TEXT_LIMIT = 4000;
const DATE = /^\d{4}-\d{2}-\d{2}/;

/** Published, rejected or reviewed by a person. */
export function isLocked(row: Pick<ExistingRow, 'review_status' | 'reviewed_at'>): boolean {
  return row.review_status === 'published' || row.review_status === 'rejected' || !!row.reviewed_at;
}

function feedDeadline(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = DATE.exec(value.trim());
  return m ? m[0] : null;
}

function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (u: string | null | undefined) => {
    if (!u) return '';
    try {
      return new URL(u.trim()).href;
    } catch {
      return u.trim();
    }
  };
  return norm(a) === norm(b);
}

/**
 * The status a refresh should set, or null for no change. Draft rows are never
 * touched; 'unknown' or a missing source status changes nothing.
 */
export function nextStatus(
  current: LawsuitStatus,
  feed: ScrapedLawsuit['status'],
): LawsuitStatus | null {
  if (feed === 'open' && current === 'closed') return 'open';
  if (feed === 'closed' && (current === 'open' || current === 'closing_soon')) return 'closed';
  return null;
}

function newRowFrom(item: ScrapedLawsuit, sourceId: string, slug: string, now: Date): NewRow {
  const rawText = item.description || item.summary || item.title || '';
  return {
    slug,
    title: item.title.trim(),
    summary: item.summary ?? null,
    description: item.description ?? null,
    category: item.category ?? 'General',
    typical_payout: item.typical_payout ?? 'Varies',
    proof_required: item.proof_required ?? false,
    deadline: feedDeadline(item.deadline),
    eligibility: (item.eligibility ?? {}) as Record<string, unknown>,
    eligibility_text: item.eligibility_text ?? null,
    source_id: sourceId,
    source_url: item.source_url ?? null,
    claim_url: item.claim_url ?? null,
    external_id: item.external_id,
    raw_source_text: rawText.slice(0, RAW_TEXT_LIMIT),
    administrator: null,
    extraction_confidence: null,
    estimated_value_min: null,
    estimated_value_max: null,
    review_status: 'pending_review',
    status: 'open',
    last_seen_at: now.toISOString(),
    missed_feed_count: 0,
  };
}

function finishUpdate(
  row: ExistingRow,
  patch: Record<string, unknown>,
  changes: string[],
  deadlineChange: PlannedUpdate['deadlineChange'],
  now: Date,
): PlannedUpdate {
  const after = { ...row, ...patch } as ExistingRow;
  const closes = isOpenForClaims(row, now) && !isOpenForClaims(after, now);
  return {
    id: row.id,
    slug: row.slug,
    patch,
    changes,
    closes,
    reopens: row.status === 'closed' && patch.status === 'open',
    deadlineChange,
    closeReason: closes ? 'feed_status' : undefined,
  };
}

/** A locked row: only the deadline and the open/closed status follow the feed. */
function planLocked(row: ExistingRow, item: ScrapedLawsuit, now: Date) {
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  let deadlineChange: PlannedUpdate['deadlineChange'] = null;

  const deadline = feedDeadline(item.deadline);
  if (deadline && deadline !== row.deadline) {
    patch.deadline = deadline;
    changes.push(`deadline ${row.deadline ?? 'none'} -> ${deadline}`);
    deadlineChange = { from: row.deadline, to: deadline };
  }
  const status = nextStatus(row.status, item.status);
  if (status) {
    patch.status = status;
    changes.push(`status ${row.status} -> ${status}`);
  }

  // Only published content needs a person's second look.
  const fields: string[] = [];
  if (row.review_status === 'published') {
    if (item.title && item.title.trim() !== row.title) fields.push('title');
    if (!sameUrl(item.claim_url, row.claim_url)) fields.push('claim_url');
  }

  return {
    update: changes.length ? finishUpdate(row, patch, changes, deadlineChange, now) : null,
    flag: fields.length ? { slug: row.slug, fields } : null,
  };
}

/** A row nobody has reviewed yet: refresh its content from the feed (never its slug or review state). */
function planUnlocked(row: ExistingRow, item: ScrapedLawsuit, now: Date): PlannedUpdate {
  const rawText = item.description || item.summary || item.title || '';
  const patch: Record<string, unknown> = {
    title: item.title.trim(),
    summary: item.summary ?? null,
    description: item.description ?? null,
    category: item.category ?? 'General',
    typical_payout: item.typical_payout ?? 'Varies',
    proof_required: item.proof_required ?? false,
    eligibility: item.eligibility ?? {},
    eligibility_text: item.eligibility_text ?? null,
    source_url: item.source_url ?? null,
    claim_url: item.claim_url ?? null,
    raw_source_text: rawText.slice(0, RAW_TEXT_LIMIT),
  };
  const changes = ['content refreshed (not yet reviewed)'];
  let deadlineChange: PlannedUpdate['deadlineChange'] = null;

  const deadline = feedDeadline(item.deadline);
  if (deadline && deadline !== row.deadline) {
    patch.deadline = deadline;
    changes.push(`deadline ${row.deadline ?? 'none'} -> ${deadline}`);
    deadlineChange = { from: row.deadline, to: deadline };
  }
  const status = nextStatus(row.status, item.status);
  if (status) {
    patch.status = status;
    changes.push(`status ${row.status} -> ${status}`);
  }
  return finishUpdate(row, patch, changes, deadlineChange, now);
}

/**
 * Decide what one source's records change. `existing` holds the rows that
 * share an external_id with the feed; rows the feed does not mention are not
 * passed in and never change.
 */
export function planIngest(args: {
  items: ScrapedLawsuit[];
  existing: ExistingRow[];
  sourceId: string;
  now?: Date;
}): IngestPlan {
  const now = args.now ?? new Date();
  const plan: IngestPlan = { inserts: [], updates: [], flagged: [], skipped: 0 };

  const byExternalId = new Map<string, ExistingRow>();
  for (const row of args.existing) {
    if (row.external_id) byExternalId.set(row.external_id, row);
  }

  // One decision per external id (the last record wins).
  const items = new Map<string, ScrapedLawsuit>();
  for (const item of args.items) {
    if (item?.external_id && item.title?.trim()) items.set(item.external_id, item);
  }

  const newSlugs = new Set<string>();
  for (const item of items.values()) {
    const row = byExternalId.get(item.external_id);
    if (!row) {
      const slug = slugify(item.title);
      const addable =
        item.status !== 'closed' &&
        item.status !== 'unknown' &&
        !isDeadlinePassed(item.deadline, now) &&
        !!slug &&
        !isFictionalSlug(slug) &&
        !newSlugs.has(slug);
      if (!addable) {
        plan.skipped += 1;
        continue;
      }
      newSlugs.add(slug);
      plan.inserts.push(newRowFrom(item, args.sourceId, slug, now));
      continue;
    }

    if (isLocked(row)) {
      const { update, flag } = planLocked(row, item, now);
      if (update) plan.updates.push(update);
      if (flag) plan.flagged.push(flag);
    } else {
      plan.updates.push(planUnlocked(row, item, now));
    }
  }
  return plan;
}

/** Default share of the open catalog one run may close before the breaker holds it. */
export const DEFAULT_MAX_CLOSE_SHARE = 0.2;
/** A run may always close this many rows, so small catalogs are not stuck. */
export const MIN_CLOSES_ALLOWED = 5;

/** Read INGEST_MAX_CLOSE_SHARE (a number from 0 to 1); anything else means the default. */
export function maxCloseShareFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_MAX_CLOSE_SHARE;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_MAX_CLOSE_SHARE;
}

/**
 * Hold every closing update when a run would close more than
 * max(MIN_CLOSES_ALLOWED, share x open rows). Held updates are not applied;
 * the caller logs them for a person to review. Other updates go ahead.
 */
export function applyCloseBreaker(
  plan: IngestPlan,
  opts: { openCount: number; maxShare: number; minAllowed?: number },
): { plan: IngestPlan; held: PlannedUpdate[]; allowed: number } {
  const closing = plan.updates.filter((u) => u.closes);
  const allowed = Math.max(
    opts.minAllowed ?? MIN_CLOSES_ALLOWED,
    Math.floor(opts.openCount * opts.maxShare),
  );
  if (closing.length <= allowed) return { plan, held: [], allowed };
  return {
    plan: { ...plan, updates: plan.updates.filter((u) => !u.closes) },
    held: closing,
    allowed,
  };
}

export interface HeldClosure {
  source: string;
  slug: string;
  changes: string[];
}

/** Held closures per log line, so no line is cut off and none is left out. */
export const HELD_PER_LOG_LINE = 40;

/**
 * The log lines for one source's held closures: a header, then every held row
 * with its changes, about 40 per line, each line labeled "part i of n".
 */
export function heldClosureLogLines(
  source: string,
  held: { slug: string; changes: string[] }[],
  limit: { allowed: number; openCount: number },
  perLine: number = HELD_PER_LOG_LINE,
): string[] {
  if (held.length === 0) return [];
  const parts = Math.ceil(held.length / perLine);
  const lines = [
    `[pipeline] ${source}: HELD ${held.length} closures (limit ${limit.allowed} of ${limit.openCount} open rows). ` +
      'Nothing was closed. Review every held row (listed below and stored in the run record), ' +
      'then set INGEST_MAX_CLOSE_SHARE=1 for one run to apply them.',
  ];
  for (let i = 0; i < parts; i += 1) {
    const rows = held
      .slice(i * perLine, (i + 1) * perLine)
      .map((h) => `${h.slug} (${h.changes.join('; ')})`)
      .join(', ');
    lines.push(`[pipeline] ${source}: held closures, part ${i + 1} of ${parts}: ${rows}`);
  }
  return lines;
}
