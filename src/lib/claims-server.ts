/**
 * Server-only data access for the claim flow. The claim page and routes read a
 * claim with the signed-in user's session (RLS: own rows); the dashboard list
 * is read with the service role, filtered by the verified user id. Every claim
 * write goes through the 0006 functions with the service-role client, after
 * the route has checked that the user owns the claim, so each change and its
 * claim_events row land together. Settlement reads fail closed (ok: false).
 * Never import this from a client component.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { isFictionalSlug } from '@/lib/fictional-slugs';
import {
  claimWriteFailure,
  isMissingSchemaError,
  settlementContext,
  toClaimView,
  type ClaimView,
  type DbError,
  type SettlementContext,
  type SettlementFacts,
  type TransitionPlan,
} from '@/lib/claims';

/** Settlement columns the claim flow reads (all exist since 0002). */
export const SETTLEMENT_COLUMNS =
  'id, slug, title, category, status, review_status, deadline, claim_url, source_url, eligibility_text, eligibility, proof_required, form_field_order';

export interface SettlementRecord extends SettlementFacts {
  id: string;
  title: string;
  category: string | null;
  claim_url: string | null;
  source_url: string | null;
  eligibility_text: string | null;
  eligibility: Record<string, unknown> | null;
  proof_required: boolean | null;
  /** 0013: official-form field order (C10). Absent until selected. */
  form_field_order?: string[] | null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fictional-settlement check for the claim flow: the catalog's denylist of the
 * 22 fictional settlements (src/lib/fictional-slugs.ts). Claims on them show
 * "This settlement was not real" instead of the legacy corrective notice, and
 * people without a claim get a 404.
 */
export const isFictionalSettlementSlug: (slug: string) => boolean = (slug) => isFictionalSlug(slug);

export function claimContext(settlement: SettlementFacts | null, now: Date = new Date()): SettlementContext {
  return settlementContext(settlement, now, isFictionalSettlementSlug);
}

/** Every claim write needs the service-role key. */
export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Logs a database error with its code and message only (never row data). */
export function logClaimsError(where: string, error: DbError): void {
  if (isMissingSchemaError(error)) {
    console.error(`[claims] ${where}: migration 0006_claim_states.sql is not applied`, {
      code: error?.code ?? null,
    });
    return;
  }
  console.error(`[claims] ${where}`, { code: error?.code ?? null, message: error?.message ?? null });
}

export type ClaimWriteResult =
  | { ok: true; claim: ClaimView; created: boolean }
  | { ok: false; status: 404 | 409 | 500 | 503; code: string; error: string };

function writeFailure(where: string, error: DbError): ClaimWriteResult {
  const failure = claimWriteFailure(error);
  if (failure.log) logClaimsError(where, error);
  return { ok: false, status: failure.status, code: failure.code, error: failure.error };
}

/**
 * A settlement lookup: the row (null when there is no such settlement), or
 * ok: false when it could not be read. Callers fail closed on ok: false and
 * never treat it as "not found" or as an unknown, real settlement: that would
 * tell people to file a fictional settlement, or 404 a claim that exists.
 */
export type SettlementLookup = { ok: true; settlement: SettlementRecord | null } | { ok: false };

const UNREADABLE: SettlementLookup = { ok: false };

/** A settlement by slug, published or not. Callers decide what to show. */
export async function loadSettlementBySlug(slug: string): Promise<SettlementLookup> {
  // Without the service role the read falls back to the anon key, and RLS
  // hides every unpublished row, including all fictional ones.
  if (!serviceRoleConfigured()) return UNREADABLE;
  const { data, error } = await createServiceClient()
    .from('lawsuits')
    .select(SETTLEMENT_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    logClaimsError('settlement lookup by slug failed', error);
    return UNREADABLE;
  }
  return { ok: true, settlement: (data as SettlementRecord | null) ?? null };
}

export async function loadSettlementById(id: string): Promise<SettlementLookup> {
  if (!UUID_RE.test(id)) return { ok: true, settlement: null };
  if (!serviceRoleConfigured()) return UNREADABLE;
  const { data, error } = await createServiceClient()
    .from('lawsuits')
    .select(SETTLEMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logClaimsError('settlement lookup by id failed', error);
    return UNREADABLE;
  }
  return { ok: true, settlement: (data as SettlementRecord | null) ?? null };
}

export interface ClaimWithSettlement {
  claim: ClaimView;
  settlement: SettlementRecord | null;
}

/**
 * The user's claims, newest first, each with its settlement, in one
 * service-role query filtered by the signed-in user's id (the caller verified
 * it with auth.getUser()). The service role lets a claim on a settlement that
 * is no longer listed still show its deadline and official link
 * (account-only view), and one embedded read has no URL-length limit however
 * many claims a File-all account has.
 *
 * Fails closed: claims.lawsuit_id is a NOT NULL foreign key (on delete
 * cascade), so every claim has a settlement row, and a missing one means the
 * read went wrong. The dashboard then shows its error, never a claim with
 * guessed filing guidance.
 */
export async function loadUserClaims(
  userId: string,
): Promise<{ items: ClaimWithSettlement[]; failed: boolean }> {
  if (!serviceRoleConfigured()) {
    console.error('[claims] SUPABASE_SERVICE_ROLE_KEY is not set; claims cannot be read');
    return { items: [], failed: true };
  }
  const { data, error } = await createServiceClient()
    .from('claims')
    .select(`*, settlement:lawsuits(${SETTLEMENT_COLUMNS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    logClaimsError('claims list failed', error);
    return { items: [], failed: true };
  }
  const items = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    claim: toClaimView(row),
    settlement: (row.settlement as SettlementRecord | null) ?? null,
  }));
  if (items.some((i) => !i.settlement)) {
    console.error('[claims] a claim came back without its settlement; showing the error state');
    return { items: [], failed: true };
  }
  return { items, failed: false };
}

/** Creates the user's claim in self_file (or returns the existing one) and logs it. */
export async function startTrackingClaim(args: {
  userId: string;
  lawsuitId: string;
  lawsuitTitle: string;
  detail: Record<string, unknown>;
}): Promise<ClaimWriteResult> {
  const { data, error } = await createServiceClient().rpc('claim_start_tracking', {
    p_user_id: args.userId,
    p_lawsuit_id: args.lawsuitId,
    p_lawsuit_title: args.lawsuitTitle,
    p_status: 'self_file',
    p_actor: 'user',
    p_detail: args.detail,
  });
  if (error) return writeFailure('start tracking failed', error);
  const result = data as { created?: boolean; claim?: Record<string, unknown> } | null;
  if (!result?.claim) return writeFailure('start tracking returned nothing', { code: 'empty' });
  return { ok: true, claim: toClaimView(result.claim), created: Boolean(result.created) };
}

/** Applies a planned transition and its claim_events row in one transaction. */
export async function applyClaimPlan(args: {
  claimId: string;
  userId: string;
  plan: TransitionPlan;
  detail: Record<string, unknown>;
}): Promise<ClaimWriteResult> {
  const { data, error } = await createServiceClient().rpc('claim_apply_change', {
    p_claim_id: args.claimId,
    p_user_id: args.userId,
    p_expected_status: args.plan.fromStatus,
    p_changes: args.plan.changes,
    p_actor: 'user',
    p_detail: { ...args.plan.detail, ...args.detail },
  });
  if (error) return writeFailure('claim change failed', error);
  if (!data) return writeFailure('claim change returned nothing', { code: 'empty' });
  return { ok: true, claim: toClaimView(data as Record<string, unknown>), created: false };
}

/** A request id for the event log, when the platform provides one. */
export function requestId(req: Request): string | null {
  return req.headers.get('x-vercel-id') ?? req.headers.get('x-request-id') ?? null;
}
