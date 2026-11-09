import { NextResponse } from 'next/server';
import { groupDashboardMatches, type DashboardMatch } from '@/components/claims/dashboard-model';
import { displayClaimStatus } from '@/lib/claims';
import { claimContext, type ClaimWithSettlement } from '@/lib/claims-server';
import { loadDashboardData } from '@/lib/dashboard-server';
import type { AppMatch, DashboardResponse } from '@/lib/mobile-contract';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Field by field, so a field added to DashboardMatch never reaches the app unreviewed. */
function appMatch(match: DashboardMatch): AppMatch {
  return {
    id: match.id,
    slug: match.slug,
    title: match.title,
    deadlineText: match.deadlineText,
    reasons: match.reasons,
    strength: match.strength,
    label: match.label,
    officialUrl: match.officialUrl,
  };
}

function reminders(items: ClaimWithSettlement[], now: Date): DashboardResponse['reminders'] {
  return items.flatMap(({ claim, settlement }) => {
    if (!settlement?.deadline) return [];
    const context = claimContext(settlement, now);
    if (context.deadlinePassed || displayClaimStatus(claim, context).group !== 'needs_filing') return [];
    return [{ claimId: claim.id, slug: settlement.slug, title: settlement.title, deadline: settlement.deadline }];
  });
}

/**
 * GET /api/mobile/dashboard: the web dashboard's data for the native app,
 * from the same loader, so the two cannot drift apart. Signed-in only (an app
 * bearer token or the cookie session). Never sends match scores or the
 * profile's matching answers.
 */
export async function GET(req: Request) {
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

  const now = new Date();
  const data = await loadDashboardData(supabase, user.id, now);
  const matches = groupDashboardMatches(data.matches);
  const body: DashboardResponse = {
    serverTime: now.toISOString(),
    profile: {
      firstName: data.firstName,
      onboarded: Boolean(data.profile?.onboarded),
      needsProfile: data.needsProfile,
    },
    claims: { failed: data.claims.failed, rows: data.rows, notices: data.notices },
    matches: {
      failed: data.catalog.error,
      strong: matches.strong.map(appMatch),
      possible: matches.possible.map(appMatch),
      possibleHidden: matches.possibleHidden,
    },
    closingSoon: { failed: data.catalog.error, items: data.closingSoon },
    reminders: reminders(data.claims.items, now),
  };
  return reply(body);
}
