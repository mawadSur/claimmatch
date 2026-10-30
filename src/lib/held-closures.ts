import { flags } from '@/lib/flags';
import { officialLinkFor } from '@/lib/lawsuits';
import {
  heldChangeFingerprint,
  heldClosureApplyPatch,
  type HeldClosure,
} from '@/lib/scraper/plan';
import type { IngestSummary } from '@/lib/scraper/pipeline';
import { createServiceClient } from '@/lib/supabase/server';
import type { LawsuitStatus } from '@/lib/types';

export const HELD_CLOSURE_JOB_LOOKBACK = 8;
export const HELD_CLOSURE_QUEUE_CAP = 400;

export type HeldClosureDecisionKind = 'approved' | 'dismissed';

export interface HeldClosureDecision {
  slug: string;
  decision: HeldClosureDecisionKind;
  decided_by: string | null;
  decided_at: string;
  change_fingerprint: string;
}

export interface HeldClosureQueueItem {
  slug: string;
  source: string;
  changes: string[];
  fingerprint: string;
  title: string;
  status: LawsuitStatus | null;
  deadline: string | null;
  officialHref: string | null;
  officialLabel: string | null;
  lawsuitId: string | null;
  patch: { status?: LawsuitStatus; deadline?: string };
}

export function asHeldClosures(value: unknown): HeldClosure[] {
  if (!Array.isArray(value)) return [];
  const rows: HeldClosure[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<HeldClosure>;
    if (typeof row.slug !== 'string' || !row.slug.trim()) continue;
    if (typeof row.source !== 'string' || !row.source.trim()) continue;
    const changes = Array.isArray(row.changes)
      ? row.changes.filter((c): c is string => typeof c === 'string')
      : [];
    rows.push({
      source: row.source,
      slug: row.slug,
      changes,
      id: typeof row.id === 'string' ? row.id : undefined,
      patch: row.patch && typeof row.patch === 'object' ? row.patch : undefined,
      closeReason: row.closeReason,
    });
  }
  return rows;
}

/** Newest first; first occurrence of a slug wins. */
export function dedupeHeldClosures(rows: HeldClosure[]): HeldClosure[] {
  const seen = new Set<string>();
  const out: HeldClosure[] = [];
  for (const row of rows) {
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(row);
  }
  return out;
}

export function shouldHideHeldClosure(
  fingerprint: string,
  decision: Pick<HeldClosureDecision, 'change_fingerprint'> | null | undefined,
): boolean {
  if (!decision) return false;
  return decision.change_fingerprint === fingerprint;
}

type JobHeldRow = { result: unknown; created_at: string };

export function heldClosuresFromJobs(jobs: JobHeldRow[]): HeldClosure[] {
  const collected: HeldClosure[] = [];
  for (const job of jobs) {
    const result = job.result && typeof job.result === 'object' ? (job.result as Partial<IngestSummary>) : {};
    collected.push(...asHeldClosures(result.heldClosures));
  }
  return dedupeHeldClosures(collected);
}

async function loadRecentHeldFromJobs(
  svc: ReturnType<typeof createServiceClient>,
): Promise<HeldClosure[]> {
  const { data, error } = await svc
    .from('jobs')
    .select('created_at, result')
    .eq('type', 'pipeline')
    .in('status', ['done', 'failed', 'running'])
    .order('created_at', { ascending: false })
    .limit(HELD_CLOSURE_JOB_LOOKBACK);
  if (error || !data) {
    if (error) console.error('[held-closures] jobs list failed:', error.message);
    return [];
  }
  return heldClosuresFromJobs(data as JobHeldRow[]);
}

async function loadDecisions(
  svc: ReturnType<typeof createServiceClient>,
  slugs: string[],
): Promise<Map<string, HeldClosureDecision>> {
  const map = new Map<string, HeldClosureDecision>();
  if (slugs.length === 0) return map;
  const { data, error } = await svc
    .from('held_closure_decisions')
    .select('slug, decision, decided_by, decided_at, change_fingerprint')
    .in('slug', slugs);
  if (error) {
    console.error('[held-closures] decisions list failed:', error.message);
    return map;
  }
  for (const row of (data ?? []) as HeldClosureDecision[]) {
    map.set(row.slug, row);
  }
  return map;
}

type LawsuitLite = {
  id: string;
  slug: string;
  title: string;
  status: LawsuitStatus;
  deadline: string | null;
  claim_url: string | null;
  source_url: string | null;
};

async function loadLawsuitsBySlug(
  svc: ReturnType<typeof createServiceClient>,
  slugs: string[],
): Promise<Map<string, LawsuitLite>> {
  const map = new Map<string, LawsuitLite>();
  if (slugs.length === 0) return map;
  const { data, error } = await svc
    .from('lawsuits')
    .select('id, slug, title, status, deadline, claim_url, source_url')
    .in('slug', slugs);
  if (error) {
    console.error('[held-closures] lawsuits list failed:', error.message);
    return map;
  }
  for (const row of (data ?? []) as LawsuitLite[]) {
    map.set(row.slug, row);
  }
  return map;
}

export function toQueueItem(
  held: HeldClosure,
  lawsuit: LawsuitLite | undefined,
): HeldClosureQueueItem {
  const official = lawsuit ? officialLinkFor(lawsuit) : null;
  return {
    slug: held.slug,
    source: held.source,
    changes: held.changes,
    fingerprint: heldChangeFingerprint(held.changes),
    title: lawsuit?.title ?? held.slug,
    status: lawsuit?.status ?? null,
    deadline: lawsuit?.deadline ?? null,
    officialHref: official?.href ?? null,
    officialLabel: official ? `${official.label} (${official.host})` : null,
    lawsuitId: lawsuit?.id ?? held.id ?? null,
    patch: heldClosureApplyPatch(held.changes, held.patch),
  };
}

/**
 * Held closures from recent ingest jobs, deduped by slug, minus decisions
 * whose fingerprint still matches. Empty when the queue flag is off.
 */
export async function listHeldClosureQueue(): Promise<HeldClosureQueueItem[]> {
  if (!flags.adminHeldClosures()) return [];
  const svc = createServiceClient();
  const held = await loadRecentHeldFromJobs(svc);
  if (held.length === 0) return [];
  const slugs = held.map((h) => h.slug);
  const [decisions, lawsuits] = await Promise.all([
    loadDecisions(svc, slugs),
    loadLawsuitsBySlug(svc, slugs),
  ]);
  const items: HeldClosureQueueItem[] = [];
  for (const row of held) {
    const fingerprint = heldChangeFingerprint(row.changes);
    if (shouldHideHeldClosure(fingerprint, decisions.get(row.slug))) continue;
    items.push(toQueueItem(row, lawsuits.get(row.slug)));
    if (items.length >= HELD_CLOSURE_QUEUE_CAP) break;
  }
  return items;
}

export async function recordHeldClosureDecision(input: {
  slug: string;
  decision: HeldClosureDecisionKind;
  fingerprint: string;
  adminId: string;
  patch?: Record<string, unknown> | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await svc.from('held_closure_decisions').upsert(
    {
      slug: input.slug,
      decision: input.decision,
      decided_by: input.adminId,
      decided_at: now,
      change_fingerprint: input.fingerprint,
      applied_patch: input.patch ?? null,
    },
    { onConflict: 'slug' },
  );
  if (error) {
    console.error('[held-closures] decision write failed:', error.message);
    return { ok: false, error: 'Could not store the decision.' };
  }
  return { ok: true };
}

export async function applyHeldClosure(input: {
  slug: string;
  adminId: string;
  fingerprint?: string;
  changes?: string[];
  storedPatch?: Record<string, unknown> | null;
}): Promise<{ ok: true; lawsuitId: string } | { ok: false; error: string; status?: number }> {
  const svc = createServiceClient();
  const { data: lawsuit, error: lookupError } = await svc
    .from('lawsuits')
    .select('id, slug, status, deadline')
    .eq('slug', input.slug)
    .maybeSingle();
  if (lookupError || !lawsuit) {
    return { ok: false, error: 'Settlement not found.', status: 404 };
  }
  const patch = heldClosureApplyPatch(input.changes ?? [], input.storedPatch);
  const { error: updateError } = await svc.from('lawsuits').update(patch).eq('id', lawsuit.id);
  if (updateError) {
    console.error('[held-closures] apply failed:', updateError.message);
    return { ok: false, error: 'Could not apply the closure.', status: 400 };
  }
  const fingerprint = input.fingerprint ?? heldChangeFingerprint(input.changes ?? []);
  const recorded = await recordHeldClosureDecision({
    slug: input.slug,
    decision: 'approved',
    fingerprint,
    adminId: input.adminId,
    patch,
  });
  if (!recorded.ok) return { ok: false, error: recorded.error, status: 400 };
  return { ok: true, lawsuitId: lawsuit.id as string };
}
