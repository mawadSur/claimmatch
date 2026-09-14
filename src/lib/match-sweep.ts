import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { sendMatchEmail, type MatchEmailItem } from '@/lib/email';
import type { Lawsuit, Profile } from '@/lib/types';

export interface MatchSweepResult {
  users: number;
  newMatches: number;
  emailed: number;
  skipped?: boolean;
}

/**
 * Recompute matches for every opted-in, onboarded user and email them about
 * brand-new matches (notified_at IS NULL), marking those as notified.
 *
 * Extracted from /api/cron/match to be reusable by the consolidated daily cron.
 */
export async function runMatchSweep(): Promise<MatchSweepResult> {
  if (!isSupabaseConfigured()) {
    return { users: 0, newMatches: 0, emailed: 0, skipped: true };
  }

  const supabase = createServiceClient();

  // Candidate lawsuits (published only). Build a lookup for email content.
  const { data: lawsuitData } = await supabase
    .from('lawsuits')
    .select('*')
    .neq('status', 'draft');
  const lawsuits = (lawsuitData ?? []) as Lawsuit[];

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

  let newMatches = 0;
  let emailed = 0;

  for (const profile of profiles) {
    const results = matchProfile(profile, lawsuits);

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

    // Find not-yet-notified, active matches for this user.
    const { data: pending } = await supabase
      .from('matches')
      .select('id, lawsuit_id')
      .eq('user_id', profile.id)
      .eq('dismissed', false)
      .is('notified_at', null);

    const pendingRows = (pending ?? []) as { id: string; lawsuit_id: string }[];
    if (pendingRows.length === 0) continue;
    newMatches += pendingRows.length;

    const to = profile.email;
    if (!to) continue;

    const items: MatchEmailItem[] = pendingRows
      .map((row) => lawsuitById.get(row.lawsuit_id as string))
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
