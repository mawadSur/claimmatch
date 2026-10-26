import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isFictionalSlug } from '@/lib/fictional-slugs';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { claimContext, serviceRoleConfigured, startTrackingClaim } from '@/lib/claims-server';
import type { Lawsuit } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/claims/prepare-all — start tracking every match the user does not
 * already have a claim for. Uses the 0006 server function (never a browser
 * insert). Never marks anything submitted. Matching is paused in production,
 * so this is a no-op until verified records ship.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }
  if (!serviceRoleConfigured()) {
    return NextResponse.json({ error: 'Claim writes are unavailable.' }, { status: 503 });
  }

  const [{ data: matchesData }, { data: claimsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('lawsuit_id, lawsuit:lawsuits(*)')
      .eq('user_id', user.id)
      .eq('dismissed', false),
    supabase.from('claims').select('lawsuit_id').eq('user_id', user.id),
  ]);

  const claimed = new Set(
    ((claimsData ?? []) as { lawsuit_id: string }[]).map((c) => c.lawsuit_id),
  );
  const matches = ((matchesData ?? []) as unknown as {
    lawsuit_id: string;
    lawsuit?: Lawsuit | Lawsuit[] | null;
  }[]).map((m) => ({
    lawsuit_id: m.lawsuit_id,
    lawsuit: Array.isArray(m.lawsuit) ? (m.lawsuit[0] ?? null) : (m.lawsuit ?? null),
  }));

  const created: { slug: string; id: string }[] = [];
  for (const match of matches) {
    const lawsuit = match.lawsuit;
    if (!lawsuit || claimed.has(match.lawsuit_id)) continue;
    if (!/^[0-9a-f-]{36}$/i.test(lawsuit.id)) continue;
    if (isFictionalSlug(lawsuit.slug)) continue;
    if (lawsuit.review_status !== 'published') continue;
    if (!isOpenForClaims(lawsuit)) continue;
    const context = claimContext(lawsuit);
    if (!context.published || context.fictional || !context.openForClaims) continue;

    const result = await startTrackingClaim({
      userId: user.id,
      lawsuitId: lawsuit.id,
      lawsuitTitle: lawsuit.title,
      detail: { action: 'prepare_all' },
    });
    if (result.ok && result.created) {
      created.push({ slug: lawsuit.slug, id: result.claim.id });
    }
  }

  return NextResponse.json({ prepared: created.length, packets: created });
}
