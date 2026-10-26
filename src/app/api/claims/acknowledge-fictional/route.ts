import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CLAIMS_UNAVAILABLE_MESSAGE, planClaimTransition, type ClaimView } from '@/lib/claims';
import {
  applyClaimPlan,
  claimContext,
  loadUserClaims,
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
 * POST /api/claims/acknowledge-fictional: "Got it" for every claim the
 * signed-in user has on one of the fictional settlements, in one request, so
 * an account the retired File-all flow filled with them can close them all
 * out without one tap (and one rate-limited request) per row. Each claim
 * still changes through claim_apply_change, with its own claim_events row.
 * Claims on real settlements are never touched.
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
  // JSON only, like the other claim routes (no cross-site form posts).
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return reply({ error: 'Send the request as JSON.' }, 415);
  }
  if (!serviceRoleConfigured()) {
    console.error('[claims] SUPABASE_SERVICE_ROLE_KEY is not set; claim writes are disabled');
    return reply({ error: CLAIMS_UNAVAILABLE_MESSAGE, code: 'claims_unavailable' }, 503);
  }

  const { items, failed } = await loadUserClaims(user.id);
  if (failed) {
    return reply({ error: "We couldn't load your claims right now. Please try again in a minute." }, 503);
  }

  const now = new Date();
  const claims: ClaimView[] = [];
  let errors = 0;
  for (const { claim, settlement } of items) {
    const context = claimContext(settlement, now);
    if (!context.fictional) continue;
    const plan = planClaimTransition(claim, { action: 'acknowledge_notice' }, context, now);
    if (!plan.ok || plan.noop) continue;
    const result = await applyClaimPlan({
      claimId: claim.id,
      userId: user.id,
      plan: plan.plan,
      detail: { request_id: requestId(req), via: 'acknowledge_all_fictional' },
    });
    if (result.ok) claims.push(result.claim);
    else errors += 1;
  }

  if (errors > 0) {
    return reply(
      {
        error: "Some of these couldn't be saved. Please try again in a minute.",
        claims,
        acknowledged: claims.length,
      },
      500,
    );
  }
  return reply({ claims, acknowledged: claims.length });
}
