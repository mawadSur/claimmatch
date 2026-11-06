/**
 * Server-only: everything the dashboard shows for one signed-in user. The
 * dashboard page and the app's dashboard endpoint both call it, so they cannot
 * drift apart. The profile, profile facts and stored matches are read with the
 * caller's client (RLS: own rows); claims and filing jobs with the service
 * role. Never import this from a client component.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildClosingSoon,
  buildDashboard,
  buildDashboardMatches,
  buildDashboardMatchesFromStored,
  dashboardNeedsProfile,
} from '@/components/claims/dashboard-model';
import { isFictionalSettlementSlug, loadUserClaims } from '@/lib/claims-server';
import { listUserFilingJobs } from '@/lib/filing/queue';
import { flags } from '@/lib/flags';
import { lookupLawsuits } from '@/lib/lawsuits';
import { factsFromRows } from '@/lib/profile-facts';
import type { Lawsuit, Match, Profile } from '@/lib/types';

export async function loadDashboardData(supabase: SupabaseClient, userId: string, now: Date) {
  const [{ data: profile }, claims, catalog, filingJobs, factRes, storedRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, onboarded, state, attributes')
      .eq('id', userId)
      .maybeSingle(),
    loadUserClaims(userId),
    // Only settlements open for claims (the shared rule); buildClosingSoon
    // applies the same rule again and drops tracked ones. A failed query is
    // shown as an error, never as "no deadlines coming up".
    lookupLawsuits().catch(() => ({ lawsuits: [], error: true })),
    flags.assistedFiling() ? listUserFilingJobs(userId) : Promise.resolve([]),
    flags.profileV2()
      ? supabase
          .from('profile_facts')
          .select('type, value, start_date, end_date, source')
          .eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    flags.matchStore()
      ? supabase
          .from('matches')
          .select('*, lawsuit:lawsuits(*)')
          .eq('user_id', userId)
          .eq('dismissed', false)
          .order('score', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { rows, notices } = buildDashboard(claims.items, now, isFictionalSettlementSlug);
  const tracked = new Set(claims.items.map((i) => i.claim.lawsuit_id));
  const closingSoon = buildClosingSoon(catalog.lawsuits, tracked, now, isFictionalSettlementSlug);
  const matchProfile = {
    state: (profile?.state as string | null) ?? null,
    attributes: ((profile?.attributes as Profile['attributes'] | null) ?? {}) as Profile['attributes'],
    onboarded: Boolean(profile?.onboarded),
    facts: factsFromRows(factRes.data),
  };
  // MATCH_STORE_ENABLED: stored matches, when there are any, replace the
  // live-computed ones.
  const storedMatches =
    flags.matchStore() && storedRes.data
      ? buildDashboardMatchesFromStored(
          storedRes.data as (Match & { lawsuit?: Lawsuit | null })[],
          now,
          isFictionalSettlementSlug,
        )
      : [];
  const matches = catalog.error
    ? []
    : storedMatches.length > 0
      ? storedMatches
      : buildDashboardMatches(matchProfile, catalog.lawsuits, now, isFictionalSettlementSlug);
  const needsProfile = dashboardNeedsProfile(matchProfile);

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  return {
    profile,
    claims,
    catalog,
    filingJobs,
    rows,
    notices,
    closingSoon,
    matchProfile,
    matches,
    needsProfile,
    firstName,
  };
}
