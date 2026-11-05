import { NextResponse } from 'next/server';
import type { PacketProfile } from '@/lib/claim-screen';
import { loadClaimScreen } from '@/lib/claim-screen-server';
import type { ClaimScreenError, ClaimScreenResponse } from '@/lib/mobile-contract';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

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

  const limit = rateLimit(`mobile-read:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return reply(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(limit.retryAfter) },
    );
  }

  const { slug } = await params;
  const now = new Date();
  const screen = await loadClaimScreen(supabase, user.id, slug, now);
  if (screen.kind === 'load_error') {
    return reply({ code: 'load_error', what: screen.what } satisfies ClaimScreenError, 503);
  }
  if (screen.kind === 'not_found') return reply({ code: 'not_found' } satisfies ClaimScreenError, 404);

  const { settlement, context } = screen;
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
        };
  return reply(body);
}
