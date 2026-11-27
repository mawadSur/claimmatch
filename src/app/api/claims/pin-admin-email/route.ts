import { NextResponse } from 'next/server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { createServiceClient } from '@/lib/supabase/server';
import { logClaimsError, UUID_RE } from '@/lib/claims-server';
import { officialSiteUrl } from '@/lib/lawsuit-display';
import { recordPinAdminEmailRequest, sendPinAdminEmailForClaim } from '@/lib/pin-admin-email-send';
import { getValidClaimUrl } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/claims/pin-admin-email — record a PIN-gated email-to-administrator
 * request. Outbound send is gated by PIN_ADMIN_EMAIL_ENABLED (default off).
 */
export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? reply(AUTH_UNAVAILABLE, 503)
      : reply({ error: 'Please log in again to save this step.' }, 401);
  }
  const { user } = auth;

  const limit = rateLimit(`pin-admin-email:${user.id}`, { limit: 10, windowMs: 60_000 });
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

  const claim = await recordPinAdminEmailRequest(user.id, lawsuitId);
  if (!claim) {
    logClaimsError('claim_request_pin_admin_email failed', { message: 'rpc returned nothing' });
    return reply({ error: 'We could not save that step. Try again.' }, 400);
  }

  const svc = createServiceClient();
  const { data: lawsuit, error } = await svc
    .from('lawsuits')
    .select('id, slug, title, administrator, claim_url')
    .eq('id', lawsuitId)
    .maybeSingle();
  if (error || !lawsuit) {
    return reply({ claim, send: 'queued' });
  }
  const row = lawsuit as {
    slug: string;
    title: string | null;
    administrator: string | null;
    claim_url: string | null;
  };
  const result = await sendPinAdminEmailForClaim({
    userId: user.id,
    claimId: claim.id,
    title: row.title || claim.lawsuit_title,
    slug: row.slug,
    administrator: row.administrator,
    officialHref: officialSiteUrl(getValidClaimUrl(row.claim_url) ?? row.claim_url),
    senderName: user.email?.split('@')[0] || user.email || 'Claimant',
    senderEmail: user.email || '',
  });
  return reply({ claim: result.claim, send: result.status, error: result.status === 'failed' ? result.error : undefined });
}
