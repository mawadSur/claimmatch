import { NextResponse } from 'next/server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { parseNoticeId } from '@/lib/notice-id';
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
 * POST /api/claims/notice-id — save a notice/claim ID on the signed-in user's
 * claim for this settlement (not the shared claim profile). Never a PIN.
 */
export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable ? reply(AUTH_UNAVAILABLE, 503) : reply({ error: 'Please log in again to save this ID.' }, 401);
  }
  const { user } = auth;

  const limit = rateLimit(`notice-id:${user.id}`, { limit: 30, windowMs: 60_000 });
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
  const parsed = parseNoticeId(input.notice_id);
  if (!parsed.ok) return reply({ error: parsed.message }, 400);

  const svc = createServiceClient();
  const { data, error } = await svc.rpc('claim_set_notice_id', {
    p_user_id: user.id,
    p_lawsuit_id: lawsuitId,
    p_notice_id: parsed.value,
  });
  if (error) {
    logClaimsError('claim_set_notice_id failed', error);
    return reply({ error: 'We could not save that ID. Try again.' }, 400);
  }
  if (!data) return reply({ error: 'We could not save that ID. Try again.' }, 400);
  return reply({ claim: toClaimView(data as Record<string, unknown>) });
}
