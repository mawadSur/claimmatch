/**
 * Server-only: everything the dashboard shows for one signed-in user. The
 * dashboard page and the app's dashboard endpoint both call it, so they cannot
 * drift apart. The profile is read with the caller's client (RLS: own row);
 * claims and filing jobs with the service role. Never import this from a
 * client component.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildClosingSoon,
  buildDashboard,
  buildDashboardMatches,
  dashboardNeedsProfile,
} from '@/components/claims/dashboard-model';
import { isFictionalSettlementSlug, loadUserClaims } from '@/lib/claims-server';
import { listUserFilingJobs } from '@/lib/filing/queue';
import { flags } from '@/lib/flags';
import { lookupLawsuits } from '@/lib/lawsuits';
import type { Profile } from '@/lib/types';

export async function loadDashboardData(supabase: SupabaseClient, userId: string, now: Date) {
  const [{ data: profile }, claims, catalog, filingJobs] = await Promise.all([
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
  ]);

  const { rows, notices } = buildDashboard(claims.items, now, isFictionalSettlementSlug);
  const tracked = new Set(claims.items.map((i) => i.claim.lawsuit_id));
  const closingSoon = buildClosingSoon(catalog.lawsuits, tracked, now, isFictionalSettlementSlug);
  const matchProfile = {
    state: (profile?.state as string | null) ?? null,
    attributes: ((profile?.attributes as Profile['attributes'] | null) ?? {}) as Profile['attributes'],
    onboarded: Boolean(profile?.onboarded),
  };
  const matches = catalog.error
    ? []
    : buildDashboardMatches(matchProfile, catalog.lawsuits, now, isFictionalSettlementSlug);
  const needsProfile = dashboardNeedsProfile(matchProfile);

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  return { profile, claims, catalog, filingJobs, rows, notices, closingSoon, matches, needsProfile, firstName };
}
