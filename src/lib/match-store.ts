import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import { factsFromRows } from '@/lib/profile-facts';
import { catalogDeadlineFilter, openGuidedCatalog } from '@/lib/settlement-guides';
import type { Lawsuit, Profile, ProfileFact } from '@/lib/types';

export interface MatchStoreResult {
  users: number;
  persisted: number;
  skipped?: boolean;
}

type FactRow = {
  user_id: string;
  type: string;
  value: string;
  start_date: string | null;
  end_date: string | null;
  source: string | null;
};

/**
 * Recompute and upsert matches for onboarded users. Does not send email.
 * MATCH_STORE_ENABLED gates the cron caller; this function is the write path.
 */
export async function persistStoredMatches(): Promise<MatchStoreResult> {
  if (!isSupabaseConfigured()) {
    return { users: 0, persisted: 0, skipped: true };
  }

  const supabase = createServiceClient();
  const now = new Date();
  const { data: lawsuitData, error: lawsuitErr } = await supabase
    .from('lawsuits')
    .select('*')
    .eq('review_status', 'published')
    .in('status', ['open', 'closing_soon'])
    // The catalog's read and rule: a guided settlement by its official deadline.
    .or(catalogDeadlineFilter(now))
    .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`);
  if (lawsuitErr) {
    throw new Error(`[match-store] loading settlements failed: ${lawsuitErr.message}`);
  }
  const lawsuits = openGuidedCatalog((lawsuitData ?? []) as Lawsuit[], now);
  if (lawsuits.length === 0) {
    return { users: 0, persisted: 0 };
  }

  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('onboarded', true);
  if (profileErr) {
    throw new Error(`[match-store] loading profiles failed: ${profileErr.message}`);
  }
  const profiles = (profileData ?? []) as Profile[];
  if (profiles.length === 0) {
    return { users: 0, persisted: 0 };
  }

  const { data: factData } = await supabase
    .from('profile_facts')
    .select('user_id, type, value, start_date, end_date, source')
    .in(
      'user_id',
      profiles.map((p) => p.id),
    );
  const factsByUser = groupFacts((factData ?? []) as FactRow[]);

  let persisted = 0;
  for (const profile of profiles) {
    const withFacts: Profile = {
      ...profile,
      facts: factsByUser.get(profile.id) ?? [],
    };
    const results = matchProfile(withFacts, lawsuits);
    if (results.length === 0) continue;

    const rows = results.map((r) => ({
      user_id: profile.id,
      lawsuit_id: r.lawsuit_id,
      score: r.score,
      reasons: r.reasons,
    }));
    const { error: upsertErr } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'user_id,lawsuit_id' });
    if (upsertErr) {
      console.error(`[match-store] upsert failed for ${profile.id}:`, upsertErr);
      continue;
    }
    persisted += rows.length;
  }

  return { users: profiles.length, persisted };
}

function groupFacts(rows: FactRow[]): Map<string, ProfileFact[]> {
  const byUser = new Map<string, FactRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }
  const facts = new Map<string, ProfileFact[]>();
  for (const [userId, list] of byUser) {
    facts.set(userId, factsFromRows(list));
  }
  return facts;
}
