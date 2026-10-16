import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CLAIMS_UNAVAILABLE_MESSAGE, parseStartTracking, toClaimView } from '@/lib/claims';
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
 * Refuses closed, unpublished and fictional settlements. The open check is the
 * claim flow's own helper (isOpenForClaims) until the shared catalog rule lands.
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
  const { lawsuitId } = parsed.value;

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

  const settlement = await loadSettlementById(lawsuitId);
  const context = claimContext(settlement);
  if (!settlement || !context.published || context.fictional) {
    return reply({ error: "We couldn't find that settlement." }, 404);
  }
  if (!context.openForClaims) {
    return reply(
      { error: 'This settlement is closed to new claims. Check the official site to be sure.', code: 'settlement_closed' },
      409,
    );
  }

  const result = await startTrackingClaim({
    userId: user.id,
    lawsuitId: settlement.id,
    lawsuitTitle: settlement.title,
    detail: { action: 'start_tracking', request_id: requestId(req) },
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
