import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { sendMatchEmail, type MatchEmailItem } from '@/lib/email';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import {
  isEmailableStoredMatch,
  MATCH_EMAIL_SCORE_THRESHOLD,
  wantsInstantMatchEmails,
} from '@/lib/match-email';
import { factsFromRows } from '@/lib/profile-facts';
import { catalogDeadlineFilter, openGuidedCatalog } from '@/lib/settlement-guides';
import type { Lawsuit, Profile, ProfileFact } from '@/lib/types';

export interface MatchSweepResult {
  users: number;
  newMatches: number;
  emailed: number;
  skipped?: boolean;
}

/**
 * Recompute matches for every opted-in, onboarded user and email instant
 * subscribers about brand-new matches (notified_at IS NULL, score at or
 * above MATCH_EMAIL_SCORE_THRESHOLD), marking those as notified. Weekly
 * subscribers are stored but emailed by the digest. Unsubscribed accounts
 * (email_opt_in false) are never loaded.
 *
 * Only settlements open for claims count (isOpenForClaims: published, not
 * fictional, open status, deadline not passed). This runs with the
 * service-role client, which bypasses RLS, so the review gate is applied here
 * explicitly. D50: the caller keeps this switched off until the Phase 1
 * engine ships; it must still be correct if it runs.
 *
 * Extracted from /api/cron/match to be reusable by the consolidated daily cron.
 */
export async function runMatchSweep(): Promise<MatchSweepResult> {
  if (!isSupabaseConfigured()) {
    return { users: 0, newMatches: 0, emailed: 0, skipped: true };
  }

  const supabase = createServiceClient();

  // Candidate lawsuits: open for claims only. Build a lookup for email content.
  const now = new Date();
  const { data: lawsuitData, error: lawsuitErr } = await supabase
    .from('lawsuits')
    .select('*')
    .eq('review_status', 'published')
    .in('status', ['open', 'closing_soon'])
    .or(catalogDeadlineFilter(now))
    .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`);
  if (lawsuitErr) {
    // Fail loudly so the cron reports an error instead of a quiet "0 sent".
    throw new Error(`[match-sweep] loading settlements failed: ${lawsuitErr.message}`);
  }
  // As the catalog does: the query drops past America/New_York deadlines but
  // reads every guided row; the official-notice guides replace the feed's
  // deadline (and payout) before the open rule runs again, and matchProfile
  // refuses any leftover expired row.
  const lawsuits = openGuidedCatalog((lawsuitData ?? []) as Lawsuit[], now);

  if (lawsuits.length === 0) {
    return { users: 0, newMatches: 0, emailed: 0 };
  }

  const lawsuitById = new Map<string, Lawsuit>(
    lawsuits.map((l) => [l.id, l] as [string, Lawsuit]),
  );

  // Users who want match alerts.
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('email_opt_in', true)
    .eq('onboarded', true);
  const profiles = (profileData ?? []) as Profile[];
  const factsByUser = await loadFactsByUser(
    supabase,
    profiles.map((p) => p.id),
  );

  let newMatches = 0;
  let emailed = 0;

  for (const profile of profiles) {
    const results = matchProfile(
      { ...profile, facts: factsByUser.get(profile.id) ?? [] },
      lawsuits,
    );

    if (results.length > 0) {
      const rows = results.map((r) => ({
        user_id: profile.id,
        lawsuit_id: r.lawsuit_id,
        score: r.score,
        reasons: r.reasons,
      }));
      // Upsert without touching notified_at, so already-notified matches keep
      // their timestamp and won't be re-emailed.
      const { error: upsertErr } = await supabase
        .from('matches')
        .upsert(rows, { onConflict: 'user_id,lawsuit_id' });
      if (upsertErr) {
        console.error(`[match-sweep] upsert failed for ${profile.id}:`, upsertErr);
        continue;
      }
    }

    if (!wantsInstantMatchEmails(profile)) continue;

    // Find not-yet-notified, active matches above the email score floor.
    const { data: pending } = await supabase
      .from('matches')
      .select('id, lawsuit_id, score, dismissed, notified_at')
      .eq('user_id', profile.id)
      .eq('dismissed', false)
      .is('notified_at', null)
      .gte('score', MATCH_EMAIL_SCORE_THRESHOLD);

    // Only matches on settlements that are open for claims right now. Others
    // stay un-notified, so nothing is marked sent that was never emailed.
    const pendingRows = ((pending ?? []) as {
      id: string;
      lawsuit_id: string;
      score: number;
      dismissed: boolean;
      notified_at: string | null;
    }[]).filter((row) => lawsuitById.has(row.lawsuit_id) && isEmailableStoredMatch(row));
    if (pendingRows.length === 0) continue;
    newMatches += pendingRows.length;

    const to = profile.email;
    if (!to) continue;

    const items: MatchEmailItem[] = pendingRows
      .map((row) => lawsuitById.get(row.lawsuit_id))
      .filter((l): l is Lawsuit => !!l)
      .map((l) => ({
        title: l.title,
        slug: l.slug,
        typical_payout: l.typical_payout,
        deadline: l.deadline,
      }));

    if (items.length === 0) continue;

    await sendMatchEmail(to, {
      name: profile.full_name ?? undefined,
      matches: items,
    });

    // Mark these matches as notified.
    const ids = pendingRows.map((r) => r.id);
    const { error: markErr } = await supabase
      .from('matches')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids);
    if (markErr) {
      console.error(`[match-sweep] mark notified failed for ${profile.id}:`, markErr);
    } else {
      emailed += 1;
    }
  }

  return { users: profiles.length, newMatches, emailed };
}

async function loadFactsByUser(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Map<string, ProfileFact[]>> {
  const facts = new Map<string, ProfileFact[]>();
  if (userIds.length === 0) return facts;
  const { data } = await supabase
    .from('profile_facts')
    .select('user_id, type, value, start_date, end_date, source')
    .in('user_id', userIds);
  const grouped = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const userId = (row as { user_id: string }).user_id;
    const list = grouped.get(userId) ?? [];
    list.push(row);
    grouped.set(userId, list);
  }
  for (const [userId, rows] of grouped) {
    facts.set(userId, factsFromRows(rows ?? []));
  }
  return facts;
}
