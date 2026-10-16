import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  CLAIMS_UNAVAILABLE_MESSAGE,
  hasSelfFileColumns,
  parseClaimPatch,
  planClaimTransition,
  toClaimView,
} from '@/lib/claims';
import {
  UUID_RE,
  applyClaimPlan,
  claimContext,
  loadSettlementById,
  logClaimsError,
  requestId,
  serviceRoleConfigured,
} from '@/lib/claims-server';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/**
 * PATCH /api/claims/[id]: the owner reports what happened with their claim.
 *
 *   { action: 'report_filed', confirmation_number?, filed_on? }
 *        -> 'submitted' when a confirmation number is given, else 'reported_filed'
 *   { action: 'add_confirmation', confirmation_number }
 *        -> 'submitted' (or corrects the number on a submitted claim)
 *   { action: 'undo_report' }          -> back to 'self_file'
 *   { action: 'acknowledge_notice' }   -> answers the corrective notice
 *
 * The user's session proves who they are and that they own the claim; the
 * change is then written with the service-role client, together with its
 * claim_events row. Bad input is a 400, never a 500.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ error: 'Please log in again.' }, 401);

  const limit = rateLimit(`claims:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return reply(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(limit.retryAfter) },
    );
  }
  if (!UUID_RE.test(id)) return reply({ error: "We couldn't find that claim." }, 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }
  const now = new Date();
  const parsed = parseClaimPatch(body, now);
  if (!parsed.ok) return reply({ error: parsed.message }, 400);

  // Ownership: read the claim with the user's own session (RLS: own rows only).
  const { data: row, error } = await supabase.from('claims').select('*').eq('id', id).maybeSingle();
  if (error) {
    logClaimsError('claim lookup failed', error);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
  if (!row || row.user_id !== user.id) return reply({ error: "We couldn't find that claim." }, 404);

  if (!hasSelfFileColumns(row as Record<string, unknown>)) {
    console.error('[claims] migration 0006_claim_states.sql is not applied: claims has no self-file columns');
    return reply({ error: CLAIMS_UNAVAILABLE_MESSAGE, code: 'claims_unavailable' }, 503);
  }
  if (!serviceRoleConfigured()) {
    console.error('[claims] SUPABASE_SERVICE_ROLE_KEY is not set; claim writes are disabled');
    return reply({ error: CLAIMS_UNAVAILABLE_MESSAGE, code: 'claims_unavailable' }, 503);
  }

  const claim = toClaimView(row as Record<string, unknown>);
  const settlement = await loadSettlementById(claim.lawsuit_id);
  const plan = planClaimTransition(claim, parsed.value, claimContext(settlement, now), now);
  if (!plan.ok) return reply({ error: plan.message, code: plan.refusal }, 409);
  if (plan.noop) return reply({ claim, changed: false });

  const result = await applyClaimPlan({
    claimId: claim.id,
    userId: user.id,
    plan: plan.plan,
    detail: { request_id: requestId(req) },
  });
  if (!result.ok) return reply({ error: result.error, code: result.code }, result.status);
  return reply({ claim: result.claim, changed: true });
}
