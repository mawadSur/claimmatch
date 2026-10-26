import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { isOpenForClaims, lookupLawsuits } from '@/lib/lawsuits';
import type { Lawsuit, Match, Profile } from '@/lib/types';

/**
 * POST /api/matches — recompute the current user's matches and upsert them.
 * Returns the number of eligible matches found.
 *
 * Only settlements open for claims are considered (isOpenForClaims). There is
 * no fallback to made-up settlements: if the catalog cannot be read, this
 * fails with 503 and stores nothing.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Load the user's profile (attributes + state drive the matcher).
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Profile);

  const catalog = await lookupLawsuits();
  if (catalog.error) {
    return NextResponse.json(
      { error: 'We couldn’t load settlements right now. Please try again in a few minutes.' },
      { status: 503 },
    );
  }

  const results = matchProfile(profile, catalog.lawsuits);
  const rows = results.map((r) => ({
    user_id: user.id,
    lawsuit_id: r.lawsuit_id,
    score: r.score,
    reasons: r.reasons,
  }));

  let persisted = 0;
  if (rows.length > 0) {
    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'user_id,lawsuit_id' });
    if (error) {
      console.error('[matches] upsert failed:', error.message);
    } else {
      persisted = rows.length;
    }
  }

  return NextResponse.json({ count: results.length, persisted });
}

/**
 * GET /api/matches — the current user's active matches on settlements that
 * are still open for claims, best first. Matches on closed, unpublished or
 * fictional settlements are left out.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('matches')
    .select('*, lawsuit:lawsuits(*)')
    .eq('user_id', user.id)
    .eq('dismissed', false)
    .order('score', { ascending: false });

  if (error) {
    console.error('[matches] list failed:', error.message);
    return NextResponse.json({ matches: [] });
  }

  const now = new Date();
  const matches = ((data ?? []) as (Match & { lawsuit?: Lawsuit | null })[]).filter(
    (m) => !!m.lawsuit && isOpenForClaims(m.lawsuit, now),
  );
  return NextResponse.json({ matches });
}
