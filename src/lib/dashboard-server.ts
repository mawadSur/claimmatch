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
  lawsuitIdsAlreadyOnDashboard,
} from '@/components/claims/dashboard-model';
import { isFictionalSettlementSlug, loadUserClaims } from '@/lib/claims-server';
import type { MembershipStart, ReportedPayoutRow } from '@/lib/dashboard-value';
import { listUserFilingJobs } from '@/lib/filing/queue';
import { flags } from '@/lib/flags';
import { lookupLawsuits } from '@/lib/lawsuits';
import { factsFromRows } from '@/lib/profile-facts';
import { applySettlementGuide } from '@/lib/settlement-guides';
import type { Lawsuit, Match, Profile } from '@/lib/types';

export async function loadDashboardData(supabase: SupabaseClient, userId: string, now: Date) {
  const [{ data: profile }, claims, catalog, filingJobs, factRes, storedRes, payoutRes, subRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, onboarded, state, attributes')
      .eq('id', userId)
      .maybeSingle(),
    loadUserClaims(userId),
    // Only settlements open for claims (the shared rule); buildClosingSoon
    // applies the same rule again and drops tracked ones. A failed query is
    // shown as an error, never as "no deadlines coming up".
    lookupLawsuits().catch(() => ({ lawsuits: [], openingSoon: [], error: true })),
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
    // DASHBOARD_VALUE_ENABLED: the member's own user-reported payouts and
    // membership start, for the value panel. Read with the caller's client
    // (RLS: "own recoveries read" / "own subscriptions read"), never the
    // service role. Off: nothing is read, so a fake client in the route tests
    // is never asked for a chain it does not implement.
    flags.dashboardValue()
      ? supabase
          .from('recoveries')
          .select('gross_amount')
          .eq('user_id', userId)
          .eq('source', 'user_reported')
      : Promise.resolve({ data: [], error: null }),
    flags.dashboardValue()
      ? supabase
          .from('subscriptions')
          .select('created_at, trial_end')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { rows, notices } = buildDashboard(claims.items, now, isFictionalSettlementSlug);
  const matchProfile = {
    state: (profile?.state as string | null) ?? null,
    attributes: ((profile?.attributes as Profile['attributes'] | null) ?? {}) as Profile['attributes'],
    onboarded: Boolean(profile?.onboarded),
    facts: factsFromRows(factRes.data),
  };
  // NO_PIN_BREACH_PRIORITY_ENABLED: the same ordering option goes to both
  // builders, so the dashboard order cannot depend on whether the match store
  // has run. Inert until lawsuits.claim_action_type exists and is populated.
  const matchOpts = { noPinBreachFirst: flags.noPinBreachPriority() };
  // MATCH_STORE_ENABLED: stored matches, when there are any, replace the
  // live-computed ones. Their settlements carry the official-notice guides,
  // as the catalog's rows do (claims already do: loadUserClaims).
  const storedMatches =
    flags.matchStore() && storedRes.data
      ? buildDashboardMatchesFromStored(
          (storedRes.data as (Match & { lawsuit?: Lawsuit | null })[]).map((row) =>
            row.lawsuit ? { ...row, lawsuit: applySettlementGuide(row.lawsuit) } : row,
          ),
          now,
          isFictionalSettlementSlug,
          matchOpts,
        )
      : [];
  const matches = catalog.error
    ? []
    : storedMatches.length > 0
      ? storedMatches
      : buildDashboardMatches(matchProfile, catalog.lawsuits, now, isFictionalSettlementSlug, matchOpts);
  // Closing soon drops tracked claims and visible matches so a card is never
  // listed twice. Easy submit matches stay in Your matches (at the top).
  const closingSoon = buildClosingSoon(
    catalog.lawsuits,
    lawsuitIdsAlreadyOnDashboard(
      claims.items.map((item) => item.claim.lawsuit_id),
      matches,
    ),
    now,
    isFictionalSettlementSlug,
  );
  const needsProfile = dashboardNeedsProfile(matchProfile);

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  // A read error falls back to "nothing on file" so a missing table or a denied
  // row never takes the whole dashboard down (same posture as beta_feedback).
  const payouts = (payoutRes.data as ReportedPayoutRow[] | null) ?? [];
  const subRow = (subRes.data as { created_at?: string | null; trial_end?: string | null } | null) ?? null;
  const membership: MembershipStart | null = subRow
    ? { createdAt: subRow.created_at ?? null, trialEnd: subRow.trial_end ?? null }
    : null;

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
    payouts,
    membership,
  };
}
