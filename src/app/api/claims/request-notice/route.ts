import { NextResponse } from 'next/server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { createServiceClient } from '@/lib/supabase/server';
import { logClaimsError, UUID_RE } from '@/lib/claims-server';
import { toClaimView } from '@/lib/claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/claims/request-notice — stamp requested_notice_at on the signed-in
 * user's claim. Does not send email. Guests keep the step in sessionStorage.
 */
export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? reply(AUTH_UNAVAILABLE, 503)
      : reply({ error: 'Please log in again to save this step.' }, 401);
  }
  const { user } = auth;

  const limit = rateLimit(`request-notice:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return reply({ error: 'Too many requests. Please wait a moment and try again.' }, 429);
  }
  if (!isJsonRequest(req)) return reply({ error: 'Send the request as JSON.' }, 415);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const lawsuitId = typeof input.lawsuit_id === 'string' ? input.lawsuit_id : '';
  if (!UUID_RE.test(lawsuitId)) {
    return reply({ error: 'A valid settlement is required.' }, 400);
  }

  const svc = createServiceClient();
  const { data, error } = await svc.rpc('claim_mark_notice_requested', {
    p_user_id: user.id,
    p_lawsuit_id: lawsuitId,
  });
  if (error) {
    logClaimsError('claim_mark_notice_requested failed', error);
    return reply({ error: 'We could not save that step. Try again.' }, 400);
  }
  if (!data) return reply({ error: 'We could not save that step. Try again.' }, 400);
  return reply({ claim: toClaimView(data as Record<string, unknown>) });
}
