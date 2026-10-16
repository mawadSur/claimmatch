/**
 * Server-only data access for the claim flow. Claims are read with the signed-in
 * user's session (RLS: own rows). Every claim write goes through the 0006
 * functions with the service-role client, after the route has checked that the
 * user owns the claim, so each change and its claim_events row land together.
 * Never import this from a client component.
 */
import { createClient, createServiceClient } from '@/lib/supabase/server';
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
  'id, slug, title, category, status, review_status, deadline, claim_url, source_url, eligibility_text, eligibility, proof_required';

export interface SettlementRecord extends SettlementFacts {
  id: string;
  title: string;
  category: string | null;
  claim_url: string | null;
  source_url: string | null;
  eligibility_text: string | null;
  eligibility: Record<string, unknown> | null;
  proof_required: boolean | null;
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

/** A settlement by slug, published or not. Callers decide what to show. */
export async function loadSettlementBySlug(slug: string): Promise<SettlementRecord | null> {
  const { data, error } = await createServiceClient()
    .from('lawsuits')
    .select(SETTLEMENT_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) logClaimsError('settlement lookup by slug failed', error);
  return (data as SettlementRecord | null) ?? null;
}

export async function loadSettlementById(id: string): Promise<SettlementRecord | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await createServiceClient()
    .from('lawsuits')
    .select(SETTLEMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) logClaimsError('settlement lookup by id failed', error);
  return (data as SettlementRecord | null) ?? null;
}

export interface ClaimWithSettlement {
  claim: ClaimView;
  settlement: SettlementRecord | null;
}

/**
 * The user's claims, newest first, each with its settlement. Settlements are
 * read with the service role so a claim on a settlement that is no longer
 * listed still shows its deadline and official link (account-only view).
 */
export async function loadUserClaims(
  userId: string,
): Promise<{ items: ClaimWithSettlement[]; failed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    logClaimsError('claims list failed', error);
    return { items: [], failed: true };
  }
  const claims = ((data ?? []) as Record<string, unknown>[]).map(toClaimView);
  const ids = Array.from(new Set(claims.map((c) => c.lawsuit_id).filter((id) => UUID_RE.test(id))));
  const settlements = new Map<string, SettlementRecord>();
  if (ids.length > 0) {
    const { data: rows, error: lawsuitError } = await createServiceClient()
      .from('lawsuits')
      .select(SETTLEMENT_COLUMNS)
      .in('id', ids);
    if (lawsuitError) logClaimsError('claim settlements lookup failed', lawsuitError);
    for (const row of (rows ?? []) as SettlementRecord[]) settlements.set(row.id, row);
  }
  return {
    items: claims.map((claim) => ({ claim, settlement: settlements.get(claim.lawsuit_id) ?? null })),
    failed: false,
  };
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
