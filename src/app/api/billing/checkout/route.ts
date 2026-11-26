/**
 * POST /api/billing/checkout — Stripe Checkout Session for membership.
 * 503 when STRIPE_SECRET_KEY or STRIPE_PRICE_ID is unset so public pages never break.
 */
import { NextResponse } from 'next/server';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { createCheckoutSession } from '@/lib/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Please log in to start a membership.' }, { status: 401 });
  }
  const limit = rateLimit(`billing-checkout:${auth.user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }
  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 415 });
  }
  let returnPath: string | undefined;
  try {
    const body = (await req.json()) as { return_to?: unknown };
    if (typeof body.return_to === 'string') returnPath = body.return_to;
  } catch {
    // Empty body is fine.
  }
  const result = await createCheckoutSession({
    userId: auth.user.id,
    email: auth.user.email ?? null,
    returnPath,
  });
  if (!result.ok) {
    const status =
      result.code === 'stripe_not_configured'
        ? 503
        : result.code === 'already_subscribed'
          ? 409
          : result.code === 'invalid_request'
            ? 400
            : 503;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }
  return NextResponse.json({ url: result.url });
}
