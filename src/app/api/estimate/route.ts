import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { estimateTotalOwed } from '@/lib/recovery';
import { SAMPLE_LAWSUITS } from '@/lib/sample-data';
import type { Lawsuit, Profile } from '@/lib/types';

// Uses the createServiceClient-free path but touches recovery math + matcher;
// keep it on the Node runtime for consistency with the rest of the pipeline.
export const runtime = 'nodejs';

/**
 * POST /api/estimate — recompute matches for the signed-in user's saved profile
 * and return how many settlements they likely qualify for plus the estimated
 * total they're owed. Powers the onboarding "reveal" and dashboard hero.
 *
 * Response: { count, totalOwed, matches: { lawsuit, reasons, score }[] }
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Load the user's saved profile (state + attributes drive the matcher).
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const profile: Profile =
    (profileRow as Profile) ??
    ({
      id: user.id,
      email: user.email ?? null,
      full_name: null,
      state: null,
      zip: null,
      attributes: {},
      email_opt_in: false,
      onboarded: false,
    } as Profile);

  // Candidate settlements: published only, degrading to sample data so the
  // estimate is never empty before the catalog is seeded.
  let lawsuits: Lawsuit[] = [];
  try {
    const { data } = await supabase
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'published');
    if (data && data.length > 0) lawsuits = data as Lawsuit[];
  } catch {
    // fall through to sample data
  }
  if (lawsuits.length === 0) lawsuits = SAMPLE_LAWSUITS;

  const results = matchProfile(profile, lawsuits);

  const byId = new Map(lawsuits.map((l) => [l.id, l]));
  const matches = results
    .map((r) => ({
      lawsuit: byId.get(r.lawsuit_id),
      reasons: r.reasons,
      score: r.score,
    }))
    .filter(
      (m): m is { lawsuit: Lawsuit; reasons: string[]; score: number } =>
        Boolean(m.lawsuit),
    );

  return NextResponse.json({
    count: results.length,
    totalOwed: estimateTotalOwed(matches),
    matches,
  });
}
