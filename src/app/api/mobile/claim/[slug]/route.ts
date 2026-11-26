import { NextResponse } from 'next/server';
import { loadOneClickClaimPage } from '@/components/filing/claim-page-data';
import { claimFiledByLawsuitAi } from '@/components/filing/filing-model';
import type { PacketProfile } from '@/lib/claim-screen';
import { loadClaimScreen } from '@/lib/claim-screen-server';
import { claimAppLegalDisclaimer } from '@/lib/disclaimer-flags';
import type { ClaimScreenError, ClaimScreenResponse } from '@/lib/mobile-contract';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
10
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
13
const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };
15
function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}
19
/**
 * The copy-ready fields only, whatever the profile read returned, so matching
 * answers and account flags stay out of the response even if that read widens.
 */
function packetProfile(profile: PacketProfile | null): PacketProfile | null {
  if (!profile) return null;
  return {
    full_name: profile.full_name ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    address_line1: profile.address_line1 ?? null,
    address_line2: profile.address_line2 ?? null,
    city: profile.city ?? null,
    state: profile.state ?? null,
    prefill_consent_at: profile.prefill_consent_at ?? null,
  };
}
37
/**
 * GET /api/mobile/claim/[slug]: the claim screen for the native app, from the
 * same loader as /claim/[slug], so the two cannot drift apart. The settlement
 * is read with the service role, so a claim on a settlement that left the
 * catalog (or a fictional one) still renders. Signed-in only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await getRequestUser(req);
  if (!auth.user) return auth.unavailable ? reply(AUTH_UNAVAILABLE, 503) : reply({ error: 'Please log in again.' }, 401);
  const { supabase, user } = auth;
48
  const limit = rateLimit(`mobile-read:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return reply(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(limit.retryAfter) },
    );
  }
57
  const { slug } = await params;
  const now = new Date();
  const screen = await loadClaimScreen(supabase, user.id, slug, now);
  if (screen.kind === 'load_error') {
    return reply({ code: 'load_error', what: screen.what } satisfies ClaimScreenError, 503);
  }
  if (screen.kind === 'not_found') return reply({ code: 'not_found' } satisfies ClaimScreenError, 404);
65
  const { settlement, context } = screen;
  // One-click filing: null (nothing read) while ONE_CLICK_FILING_ENABLED is
  // off, so the app shows the self-file steps exactly as before. Only the
  // web's "Start my claim" decision is sent; the app reads the claim's filing
  // view from /api/filing/claims/** itself, with its bearer token.
  const oneClick =
    screen.kind === 'closed'
      ? null
      : await loadOneClickClaimPage({
          supabase,
          userId: user.id,
          accountEmail: user.email ?? null,
          slug: settlement.slug,
          lawsuitId: settlement.id,
          claimActionType: settlement.claim_action_type,
          claim: screen.claim,
          context,
          now,
        });
  const filesThisClaim = oneClick
    ? claimFiledByLawsuitAi({
        status: oneClick.view?.claim.status ?? screen.claim?.status ?? null,
        lane: oneClick.lane,
        offerStart: oneClick.canStart,
      })
    : false;
  const legalDisclaimer = claimAppLegalDisclaimer(filesThisClaim);
  const defaultAppLegal = claimAppLegalDisclaimer(false);
  const facts = { slug: settlement.slug, title: settlement.title, category: settlement.category };
  const body: ClaimScreenResponse =
    screen.kind === 'closed'
      ? {
          kind: 'closed',
          ...facts,
          deadline: settlement.deadline,
          deadlinePassed: context.deadlinePassed,
          officialUrl: screen.officialUrl,
        }
      : {
          kind: 'flow',
          now: now.toISOString(),
          ...facts,
          settlement: screen.flowSettlement,
          context,
          claim: screen.claim,
          profile: packetProfile(screen.profile),
          oneClick: oneClick ? { canStart: oneClick.canStart } : null,
          ...(legalDisclaimer !== defaultAppLegal ? { legalDisclaimer } : {}),
        };
  return reply(body);
}
