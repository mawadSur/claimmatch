import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { SAMPLE_LAWSUITS } from '@/lib/sample-data';
import type { Lawsuit, Profile } from '@/lib/types';

/**
 * POST /api/matches — recompute the current user's matches and upsert them.
 * Returns the number of eligible matches found.
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

  // Load candidate lawsuits (published only), degrading to sample data. Mirrors
  // the estimate path (.eq('review_status','published')) so the dashboard
  // persistence and the reveal estimate always draw from the same catalog.
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

  // Only persist matches for real DB lawsuits: sample-data ids ("sample-*") are
  // not UUIDs and would fail the uuid FK cast. In sample-only mode there is no
  // durable catalog to reference, so we compute-only.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = results
    .filter((r) => UUID_RE.test(r.lawsuit_id))
    .map((r) => ({
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
      console.error('[matches] upsert failed:', error);
    } else {
      persisted = rows.length;
    }
  }

  return NextResponse.json({ count: results.length, persisted });
}

/** GET /api/matches — the current user's active matches, best score first. */
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
    console.error('[matches] list failed:', error);
    return NextResponse.json({ matches: [] });
  }

  return NextResponse.json({ matches: data ?? [] });
}
