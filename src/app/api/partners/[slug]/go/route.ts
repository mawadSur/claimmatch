import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getPartnerBySlug, leadRevenueAtClick, leadStatusAtClick } from '@/lib/partners';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Absolute URL for a safe redirect back into the app on any failure. */
function siteHome(req: Request): string {
  return new URL('/', req.url).toString();
}

/**
 * GET /api/partners/[slug]/go — records an outbound referral as a lead event,
 * then 302-redirects the member to the partner's site with attribution params.
 * The lead fee (if any) accrues here for per_lead/hybrid partners; per_conversion
 * partners accrue on a later postback. Best-effort logging never blocks the
 * redirect. Query: ?placement=dashboard&lid=<lawsuit uuid>
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const limited = rateLimit(ipKey(req), { limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.redirect(siteHome(req), { status: 302 });
  }

  const { slug } = await params;
  const partner = await getPartnerBySlug(slug);
  if (!partner || !partner.active) {
    return NextResponse.redirect(siteHome(req), { status: 302 });
  }

  const { searchParams } = new URL(req.url);
  const placement = searchParams.get('placement');
  const lidRaw = searchParams.get('lid');
  const lawsuitId = lidRaw && UUID_RE.test(lidRaw) ? lidRaw : null;

  // Who is clicking (optional — signed-out clicks are allowed and attributed to
  // no user). Never block the redirect on an auth hiccup.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  // Persist the lead event only for real DB partners (sample partners have a
  // non-UUID id and no durable row). Capture the id to attribute the postback.
  let leadEventId: string | null = null;
  if (UUID_RE.test(partner.id)) {
    try {
      const service = createServiceClient();
      const { data } = await service
        .from('lead_events')
        .insert({
          partner_id: partner.id,
          user_id: userId,
          lawsuit_id: lawsuitId,
          placement,
          status: leadStatusAtClick(partner),
          lead_fee_cents: partner.lead_fee_cents,
          revenue_cents: leadRevenueAtClick(partner),
          ip: ipKey(req),
          user_agent: req.headers.get('user-agent'),
        })
        .select('id')
        .single();
      leadEventId = data?.id ?? null;
    } catch (err) {
      console.error('[partners/go] lead insert failed:', err);
    }
  }

  // Build the destination with attribution. partner.url is admin-controlled, so
  // this is not an open redirect. Fall back to home if the URL is malformed.
  let destination: string;
  try {
    const url = new URL(partner.url);
    url.searchParams.set('utm_source', 'claimmatch');
    url.searchParams.set('utm_medium', 'referral');
    if (placement) url.searchParams.set('utm_campaign', placement);
    if (leadEventId) url.searchParams.set('subid', leadEventId);
    destination = url.toString();
  } catch {
    destination = siteHome(req);
  }

  return NextResponse.redirect(destination, { status: 302 });
}
