import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  CLAIMS_UNAVAILABLE_MESSAGE,
  SETTLEMENT_UNAVAILABLE_MESSAGE,
  canReportWithoutClaim,
  parseStartTracking,
  toClaimView,
} from '@/lib/claims';
import {
  claimContext,
  loadSettlementById,
  logClaimsError,
  requestId,
  serviceRoleConfigured,
  startTrackingClaim,
} from '@/lib/claims-server';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/**
 * POST /api/claims: start tracking a settlement. Creates the signed-in user's
 * claim as "Not filed yet" (self_file) when they have none, or returns the one
 * they have. ClaimMatch files nothing: the user files on the official site and
 * reports it with PATCH /api/claims/[id].
 *
 *   { lawsuit_id }                          save it before filing: the settlement
 *                                           must be open for claims (the shared
 *                                           rule in src/lib/open-for-claims.ts)
 *   { lawsuit_id, intent: 'report_filed' }  start it to report filing: allowed
 *                                           until 30 days after the deadline,
 *                                           also on a listing marked closed
 *                                           (canReportWithoutClaim)
 *
 * Refuses unpublished and fictional settlements either way.
 */
export async function POST(req: Request) {
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

  // JSON only: a cross-site form or text/plain post cannot reach this route
  // without a CORS preflight (defense in depth on top of SameSite cookies).
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return reply({ error: 'Send the request as JSON.' }, 415);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }

  const parsed = parseStartTracking(body);
  if (!parsed.ok) {
    if (parsed.legacyPayload) {
      // An old open tab posting the retired e-sign form. It must never start
      // (let alone "file") a claim.
      return reply(
        {
          error:
            'This page is out of date. Please refresh it. ClaimMatch does not file claims: you file on the official site, then tell us here.',
          code: 'gone',
        },
        410,
      );
    }
    return reply({ error: parsed.message }, 400);
  }
  const { lawsuitId, intent } = parsed.value;

  // An existing claim is returned as it is, whatever the settlement's state.
  const existing = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', user.id)
    .eq('lawsuit_id', lawsuitId)
    .maybeSingle();
  if (existing.error) {
    logClaimsError('existing claim lookup failed', existing.error);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
  if (existing.data) {
    return reply({ claim: toClaimView(existing.data as Record<string, unknown>), created: false });
  }

  if (!serviceRoleConfigured()) {
    console.error('[claims] SUPABASE_SERVICE_ROLE_KEY is not set; claim writes are disabled');
    return reply({ error: CLAIMS_UNAVAILABLE_MESSAGE, code: 'claims_unavailable' }, 503);
  }

  const lookup = await loadSettlementById(lawsuitId);
  if (!lookup.ok) {
    return reply({ error: SETTLEMENT_UNAVAILABLE_MESSAGE, code: 'settlement_unavailable' }, 503);
  }
  const settlement = lookup.settlement;
  const context = claimContext(settlement);
  if (!settlement || !context.published || context.fictional) {
    return reply({ error: "We couldn't find that settlement." }, 404);
  }
  if (intent === 'report_filed') {
    // Anyone who says they filed enters tracking, also after the deadline or
    // a closure on our list, until the late-report window ends.
    if (!canReportWithoutClaim(context)) {
      return reply(
        {
          error:
            'It has been more than 30 days since the deadline, so a claim can no longer be reported here. If you filed, keep the confirmation the settlement administrator sent you.',
          code: 'window_closed',
        },
        409,
      );
    }
  } else if (!context.openForClaims) {
    return reply(
      { error: 'This settlement is closed to new claims. Check the official site to be sure.', code: 'settlement_closed' },
      409,
    );
  }

  const result = await startTrackingClaim({
    userId: user.id,
    lawsuitId: settlement.id,
    lawsuitTitle: settlement.title,
    detail: { action: 'start_tracking', intent, request_id: requestId(req) },
  });
  if (!result.ok) return reply({ error: result.error, code: result.code }, result.status);
  return reply({ claim: result.claim, created: result.created }, result.created ? 201 : 200);
}

/** GET /api/claims: the signed-in user's claims, newest first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ error: 'Please log in again.' }, 401);

  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    logClaimsError('claims list failed', error);
    return reply({ error: 'Could not load your claims.' }, 500);
  }
  return reply({ claims: ((data ?? []) as Record<string, unknown>[]).map(toClaimView) });
}
