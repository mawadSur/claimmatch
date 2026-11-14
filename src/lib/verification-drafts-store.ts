/**
 * Persist and review verification drafts. Cron and admin-only. Drafts never
 * appear on public pages and never stamp verified_at on their own.
 */
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { extractVerificationDraft } from '@/lib/anthropic';
import { flags } from '@/lib/flags';
import { recordHeldClosureDecision } from '@/lib/held-closures';
import { notifyIndexNowBestEffort } from '@/lib/indexnow';
import { officialLinkFor } from '@/lib/lawsuit-display';
import { createServiceClient } from '@/lib/supabase/server';
import type { Lawsuit } from '@/lib/types';
import { isProofVerified } from '@/lib/verified-fields';
import {
  extractVerificationDraftHeuristic,
  htmlToText,
  mergeExtractions,
  sanitizeLlmExtraction,
  draftSuggestsClosed,
  draftSuggestsOpenFuture,
  type VerifyAssistClaimsStatus,
  type VerifyAssistEvidenceMap,
  type VerifyAssistExtraction,
  type VerifyAssistExtractor,
} from '@/lib/verification-draft';
import {
  VERIFY_ASSIST_BUDGET_MS,
  VERIFY_ASSIST_GAP_MS,
  VERIFY_ASSIST_MAX_PER_RUN,
  fetchOfficialPage,
  needsVerificationDraft,
} from '@/lib/verification-draft-fetch';

export const VERIFY_ASSIST_CLOSE_FINGERPRINT = 'verify-assist:site-closed';
export const VERIFY_ASSIST_REPUBLISH_FINGERPRINT = 'verify-assist:site-open';

export type VerificationDraftStatus = 'pending' | 'accepted' | 'rejected' | 'failed';

export interface VerificationDraft {
  id: string;
  lawsuit_id: string;
  source_url: string | null;
  status: VerificationDraftStatus;
  claims_status: VerifyAssistClaimsStatus | null;
  deadline: string | null;
  eligibility_verified: string | null;
  proof_verified: string | null;
  administrator: string | null;
  evidence: VerifyAssistEvidenceMap;
  extractor: VerifyAssistExtractor | null;
  http_status: number | null;
  robots_allowed: boolean | null;
  error: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  lawsuit_title?: string;
  lawsuit_slug?: string;
  lawsuit_status?: string | null;
  lawsuit_review_status?: string | null;
  lawsuit_deadline?: string | null;
}

export interface VerificationDraftRunSummary {
  considered: number;
  drafted: number;
  failed: number;
  skipped: number;
  skippedReason: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asEvidence(value: unknown): VerifyAssistEvidenceMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as VerifyAssistEvidenceMap;
}

function mapDraftRow(
  row: Record<string, unknown> & { lawsuit?: { title?: string; slug?: string; status?: string; review_status?: string; deadline?: string | null } },
): VerificationDraft {
  return {
    id: String(row.id),
    lawsuit_id: String(row.lawsuit_id),
    source_url: typeof row.source_url === 'string' ? row.source_url : null,
    status: (row.status as VerificationDraftStatus) ?? 'pending',
    claims_status: (row.claims_status as VerifyAssistClaimsStatus | null) ?? null,
    deadline: typeof row.deadline === 'string' ? row.deadline : null,
    eligibility_verified: typeof row.eligibility_verified === 'string' ? row.eligibility_verified : null,
    proof_verified: typeof row.proof_verified === 'string' ? row.proof_verified : null,
    administrator: typeof row.administrator === 'string' ? row.administrator : null,
    evidence: asEvidence(row.evidence),
    extractor: (row.extractor as VerifyAssistExtractor | null) ?? null,
    http_status: typeof row.http_status === 'number' ? row.http_status : null,
    robots_allowed: typeof row.robots_allowed === 'boolean' ? row.robots_allowed : null,
    error: typeof row.error === 'string' ? row.error : null,
    created_at: String(row.created_at ?? ''),
    reviewed_by: typeof row.reviewed_by === 'string' ? row.reviewed_by : null,
    reviewed_at: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
    review_notes: typeof row.review_notes === 'string' ? row.review_notes : null,
    lawsuit_title: row.lawsuit?.title,
    lawsuit_slug: row.lawsuit?.slug,
    lawsuit_status: row.lawsuit?.status ?? null,
    lawsuit_review_status: row.lawsuit?.review_status ?? null,
    lawsuit_deadline: row.lawsuit?.deadline ?? null,
  };
}

export function officialUrlForDraft(
  lawsuit: Pick<Lawsuit, 'claim_url' | 'source_url'>,
): string | null {
  return officialLinkFor(lawsuit)?.href ?? null;
}

type LlmFn = (pageText: string, sourceUrl: string) => Promise<unknown>;

export async function extractFromFetchedPage(
  html: string,
  sourceUrl: string,
  llmFn: LlmFn | null = extractVerificationDraft,
): Promise<VerifyAssistExtraction> {
  const text = htmlToText(html);
  const heuristic = extractVerificationDraftHeuristic(text, sourceUrl);
  if (!llmFn) return heuristic;
  try {
    const raw = await llmFn(text, sourceUrl);
    if (!raw || typeof raw !== 'object') return heuristic;
    const llm = sanitizeLlmExtraction(raw, text, sourceUrl);
    return mergeExtractions(llm, heuristic);
  } catch (err) {
    console.error('[verify-assist] llm extract failed:', err);
    return heuristic;
  }
}

async function upsertPendingDraft(
  svc: ReturnType<typeof createServiceClient>,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const { data: existing } = await svc
    .from('verification_drafts')
    .select('id')
    .eq('lawsuit_id', payload.lawsuit_id)
    .eq('status', 'pending')
    .maybeSingle();
  const write = existing
    ? await svc.from('verification_drafts').update(payload).eq('id', existing.id)
    : await svc.from('verification_drafts').insert(payload);
  if (write.error) {
    console.error('[verify-assist] draft write failed:', write.error.message);
    return { ok: false };
  }
  return { ok: true };
}

type DraftTarget = {
  id: string;
  slug: string;
  title: string;
  claim_url: string | null;
  source_url: string | null;
  drafted_at: string | null;
};

async function loadDraftTargets(
  svc: ReturnType<typeof createServiceClient>,
  lawsuitId?: string,
): Promise<DraftTarget[]> {
  let query = svc
    .from('lawsuits')
    .select('id, slug, title, claim_url, source_url, status, review_status, verified_at, deadline')
    .in('review_status', ['published', 'pending_review']);
  if (lawsuitId) query = query.eq('id', lawsuitId);
  else query = query.neq('status', 'draft');
  const { data, error } = await query.limit(400);
  if (error || !data) {
    if (error) console.error('[verify-assist] load targets failed:', error.message);
    return [];
  }
  const ids = (data as { id: string }[]).map((row) => row.id);
  const latest = new Map<string, string>();
  if (ids.length > 0) {
    const { data: drafts } = await svc
      .from('verification_drafts')
      .select('lawsuit_id, created_at, status')
      .in('lawsuit_id', ids)
      .order('created_at', { ascending: false });
    for (const row of (drafts ?? []) as Array<{ lawsuit_id: string; created_at: string; status: string }>) {
      if (!latest.has(row.lawsuit_id)) latest.set(row.lawsuit_id, row.created_at);
    }
  }
  return (data as Array<DraftTarget & { verified_at?: string | null }>).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    claim_url: row.claim_url,
    source_url: row.source_url,
    drafted_at: latest.get(row.id) ?? null,
  }));
}

/**
 * Fetch official pages and write pending drafts. No-ops when the flag is off.
 * Never sets verified_at.
 */
export async function persistVerificationDrafts(opts: {
  now?: Date;
  enabled?: boolean;
  fetchFn?: typeof fetch;
  llmFn?: LlmFn | null;
  lawsuitId?: string;
  maxPerRun?: number;
} = {}): Promise<VerificationDraftRunSummary> {
  const enabled = opts.enabled ?? flags.verifyAssist();
  const summary: VerificationDraftRunSummary = {
    considered: 0,
    drafted: 0,
    failed: 0,
    skipped: 0,
    skippedReason: null,
  };
  if (!enabled) {
    summary.skippedReason = 'VERIFY_ASSIST_ENABLED is off';
    return summary;
  }

  const now = opts.now ?? new Date();
  const svc = createServiceClient();
  const targets = await loadDraftTargets(svc, opts.lawsuitId);
  const due = opts.lawsuitId
    ? targets
    : targets.filter((row) => needsVerificationDraft(row, now)).slice(0, opts.maxPerRun ?? VERIFY_ASSIST_MAX_PER_RUN);
  summary.considered = due.length;
  if (due.length === 0) {
    summary.skipped = targets.length;
    return summary;
  }

  const started = Date.now();
  let i = 0;
  for (const row of due) {
    if (Date.now() - started > VERIFY_ASSIST_BUDGET_MS) break;
    const sourceUrl = officialUrlForDraft(row);
    if (!sourceUrl) {
      const wrote = await upsertPendingDraft(svc, {
        lawsuit_id: row.id,
        source_url: null,
        status: 'failed',
        claims_status: 'unknown',
        evidence: {},
        extractor: 'heuristic',
        http_status: null,
        robots_allowed: null,
        error: 'no_official_url',
      });
      if (wrote.ok) summary.failed += 1;
      else summary.skipped += 1;
      i += 1;
      continue;
    }
    const fetched = await fetchOfficialPage(sourceUrl, opts.fetchFn ?? fetch);
    if (fetched.signal !== 'ok' || !fetched.body) {
      const wrote = await upsertPendingDraft(svc, {
        lawsuit_id: row.id,
        source_url: sourceUrl,
        status: 'failed',
        claims_status: 'unknown',
        evidence: {},
        extractor: 'heuristic',
        http_status: fetched.http_status,
        robots_allowed: fetched.robots_allowed,
        error: fetched.error ?? fetched.signal,
      });
      if (wrote.ok) summary.failed += 1;
      else summary.skipped += 1;
    } else {
      const extraction = await extractFromFetchedPage(
        fetched.body,
        sourceUrl,
        opts.llmFn === undefined ? extractVerificationDraft : opts.llmFn,
      );
      const wrote = await upsertPendingDraft(svc, {
        lawsuit_id: row.id,
        source_url: sourceUrl,
        status: 'pending',
        claims_status: extraction.claims_status,
        deadline: extraction.deadline,
        eligibility_verified: extraction.eligibility_verified,
        proof_verified: extraction.proof_verified,
        administrator: extraction.administrator,
        evidence: extraction.evidence,
        extractor: extraction.extractor,
        http_status: fetched.http_status,
        robots_allowed: fetched.robots_allowed,
        error: null,
      });
      if (wrote.ok) summary.drafted += 1;
      else summary.failed += 1;
    }
    i += 1;
    if (i < due.length) await sleep(VERIFY_ASSIST_GAP_MS);
  }

  void captureServerEvent({
    event: ANALYTICS_EVENTS.verification_draft_run,
    distinctId: 'admin:verify-assist',
    properties: {
      considered: summary.considered,
      drafted: summary.drafted,
      failed: summary.failed,
    },
  });
  return summary;
}

export async function listPendingVerificationDrafts(): Promise<VerificationDraft[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('verification_drafts')
      .select('*, lawsuit:lawsuits(title, slug, status, review_status, deadline)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(400);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((row) => mapDraftRow(row));
  } catch {
    return [];
  }
}

export async function listVerificationDraftsByLawsuitIds(
  lawsuitIds: string[],
): Promise<Map<string, VerificationDraft>> {
  const map = new Map<string, VerificationDraft>();
  if (lawsuitIds.length === 0) return map;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('verification_drafts')
      .select('*')
      .in('lawsuit_id', lawsuitIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return map;
    for (const row of data as Array<Record<string, unknown>>) {
      const draft = mapDraftRow(row);
      if (!map.has(draft.lawsuit_id)) map.set(draft.lawsuit_id, draft);
    }
  } catch {
    return map;
  }
  return map;
}

export interface VerifyAssistFieldPatch {
  eligibility_verified?: string | null;
  proof_verified?: string | null;
  administrator?: string | null;
  deadline?: string | null;
}

function normalizeDeadline(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Deadline must be YYYY-MM-DD, or blank if not stated.' };
  }
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return { ok: false, error: 'Deadline must be a real calendar day.' };
  }
  return { ok: true, value };
}

function fieldsFromDraft(draft: VerificationDraft, overlay?: VerifyAssistFieldPatch): {
  updates: Record<string, unknown>;
  error?: string;
} {
  const eligibility = overlay && 'eligibility_verified' in overlay
    ? overlay.eligibility_verified
    : draft.eligibility_verified;
  const proof = overlay && 'proof_verified' in overlay ? overlay.proof_verified : draft.proof_verified;
  const administrator = overlay && 'administrator' in overlay ? overlay.administrator : draft.administrator;
  const deadlineRaw = overlay && 'deadline' in overlay ? overlay.deadline : draft.deadline;
  if (proof != null && proof !== '' && !isProofVerified(proof)) {
    return { updates: {}, error: 'Proof must be yes, no, optional, or unknown.' };
  }
  const deadline = normalizeDeadline(deadlineRaw);
  if (!deadline.ok) return { updates: {}, error: deadline.error };
  const updates: Record<string, unknown> = {
    eligibility_verified: typeof eligibility === 'string' ? eligibility : eligibility == null ? null : String(eligibility),
    proof_verified: proof == null || proof === '' ? null : proof,
    administrator: typeof administrator === 'string' ? administrator : administrator == null ? null : String(administrator),
  };
  if (deadline.value) updates.deadline = deadline.value;
  return { updates };
}

async function markDraftReviewed(
  svc: ReturnType<typeof createServiceClient>,
  draftId: string,
  status: 'accepted' | 'rejected',
  adminId: string,
  notes?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await svc
    .from('verification_drafts')
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: now,
      review_notes: notes ?? null,
    })
    .eq('id', draftId)
    .eq('status', 'pending');
  if (error) return { ok: false, error: 'Could not update the draft.' };
  return { ok: true };
}

async function loadPendingDraft(
  svc: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<VerificationDraft | null> {
  const { data, error } = await svc
    .from('verification_drafts')
    .select('*, lawsuit:lawsuits(id, slug, title, status, review_status, deadline)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return mapDraftRow(data as Record<string, unknown>);
}

export async function reviewVerificationDraft(input: {
  id: string;
  action: 'accept' | 'reject' | 'close' | 'republish_verify';
  adminId: string;
  fields?: VerifyAssistFieldPatch;
  notes?: string | null;
  now?: Date;
}): Promise<{ ok: true; lawsuit?: Record<string, unknown> } | { ok: false; error: string; status?: number }> {
  if (!flags.verifyAssist()) {
    return { ok: false, error: 'Verification drafts are turned off.', status: 404 };
  }
  const svc = createServiceClient();
  const draft = await loadPendingDraft(svc, input.id);
  if (!draft) return { ok: false, error: 'Draft not found.', status: 404 };
  if (draft.status !== 'pending') return { ok: false, error: 'This draft was already reviewed.' };

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  if (input.action === 'reject') {
    const marked = await markDraftReviewed(svc, draft.id, 'rejected', input.adminId, input.notes);
    if (!marked.ok) return marked;
    void captureServerEvent({
      event: ANALYTICS_EVENTS.verification_draft_rejected,
      distinctId: `admin:${input.adminId}`,
      properties: { extractor: draft.extractor },
    });
    return { ok: true };
  }

  if (input.action === 'close') {
    if (!draftSuggestsClosed(draft)) {
      return { ok: false, error: 'Close is only available when the draft says claims are closed, with evidence.' };
    }
    const patch = { status: 'closed' as const, closed_at: nowIso };
    const { data, error } = await svc
      .from('lawsuits')
      .update(patch)
      .eq('id', draft.lawsuit_id)
      .select('*')
      .single();
    if (error || !data) {
      return { ok: false, error: 'Could not close the listing.' };
    }
    const slug = draft.lawsuit_slug ?? (data as { slug?: string }).slug;
    if (slug) {
      await recordHeldClosureDecision({
        slug,
        decision: 'approved',
        fingerprint: VERIFY_ASSIST_CLOSE_FINGERPRINT,
        adminId: input.adminId,
        patch,
        source: 'admin',
      });
      void notifyIndexNowBestEffort([slug]);
    }
    const marked = await markDraftReviewed(svc, draft.id, 'accepted', input.adminId, input.notes ?? 'closed from draft');
    if (!marked.ok) return marked;
    void captureServerEvent({
      event: ANALYTICS_EVENTS.verification_assist_closed,
      distinctId: `admin:${input.adminId}`,
      properties: { claims_status: 'closed' },
    });
    return { ok: true, lawsuit: data as Record<string, unknown> };
  }

  if (input.action === 'republish_verify') {
    if (!draftSuggestsOpenFuture(draft, now)) {
      return { ok: false, error: 'Republish is only available when the draft says claims are still open with a future deadline.' };
    }
    const fields = fieldsFromDraft(draft, input.fields);
    if (fields.error) return { ok: false, error: fields.error };
    const updates = {
      ...fields.updates,
      review_status: 'published',
      reviewed_by: input.adminId,
      reviewed_at: nowIso,
      verified_at: nowIso,
      verified_by: input.adminId,
      status: 'open',
    };
    const { data, error } = await svc
      .from('lawsuits')
      .update(updates)
      .eq('id', draft.lawsuit_id)
      .select('*')
      .single();
    if (error || !data) {
      return { ok: false, error: 'Could not republish the listing.' };
    }
    const slug = draft.lawsuit_slug ?? (data as { slug?: string }).slug;
    if (slug) {
      await recordHeldClosureDecision({
        slug,
        decision: 'dismissed',
        fingerprint: VERIFY_ASSIST_REPUBLISH_FINGERPRINT,
        adminId: input.adminId,
        patch: { review_status: 'published', status: 'open' },
        source: 'admin',
      });
      void notifyIndexNowBestEffort([slug]);
    }
    const marked = await markDraftReviewed(svc, draft.id, 'accepted', input.adminId, input.notes ?? 'republished and verified from draft');
    if (!marked.ok) return marked;
    void captureServerEvent({
      event: ANALYTICS_EVENTS.verification_assist_republished,
      distinctId: `admin:${input.adminId}`,
      properties: { claims_status: 'open' },
    });
    return { ok: true, lawsuit: data as Record<string, unknown> };
  }

  // accept — stamp verified fields through the admin session, never a client timestamp.
  const fields = fieldsFromDraft(draft, input.fields);
  if (fields.error) return { ok: false, error: fields.error };
  const updates = {
    ...fields.updates,
    verified_at: nowIso,
    verified_by: input.adminId,
  };
  const { data, error } = await svc
    .from('lawsuits')
    .update(updates)
    .eq('id', draft.lawsuit_id)
    .select('*')
    .single();
  if (error || !data) {
    return { ok: false, error: 'Could not save verified fields.' };
  }
  const marked = await markDraftReviewed(svc, draft.id, 'accepted', input.adminId, input.notes);
  if (!marked.ok) return marked;
  void captureServerEvent({
    event: ANALYTICS_EVENTS.verification_draft_accepted,
    distinctId: `admin:${input.adminId}`,
    properties: { extractor: draft.extractor },
  });
  return { ok: true, lawsuit: data as Record<string, unknown> };
}
