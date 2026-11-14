/**
 * Server only: the one-click data for /claim/[slug]. With
 * ONE_CLICK_FILING_ENABLED off it returns null before reading anything, so the
 * page behaves exactly as before. Reads go through B2's loaders
 * (src/lib/filing/v2/view.ts), which never write. Never import this from a
 * client component.
 *
 * The one-click entry ("Lawsuit AI files this claim for you") is offered only
 * on a strong match: the settlement has structured who-qualifies rules and
 * the member's profile meets them (the dashboard's rule). Possible and
 * state-only matches keep the self-file steps.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaimView, SettlementContext } from '@/lib/claims';
import { flags } from '@/lib/flags';
import { loadClaimFilingView, previewLanes } from '@/lib/filing/v2/view';
import type { ClaimFilingView, LaneView } from '@/lib/filing/v2/contract';
import { lookupLawsuitBySlug } from '@/lib/lawsuits';
import { classifyMatch, matchProfile } from '@/lib/matching';
import { factsFromRows } from '@/lib/profile-facts';
import type { Profile } from '@/lib/types';
import { isOneClickStatus } from './filing-model';
import { sessionHasFreshSignIn } from './fresh-sign-in';
import type { OneClickClaimProps } from './types';

function logFilingError(what: string, err: unknown): void {
  // Never the member's data: the step and the error name only.
  console.error(`[filing] ${what}`, err instanceof Error ? err.name : typeof err);
}

/** Strong match for this member today, by the dashboard's rule (classifyMatch plus matchProfile). */
export async function isStrongMatch(supabase: SupabaseClient, userId: string, slug: string, now: Date): Promise<boolean> {
  try {
    const [lookup, profileRes, factsRes] = await Promise.all([
      lookupLawsuitBySlug(slug),
      supabase.from('profiles').select('state, attributes, onboarded').eq('id', userId).maybeSingle(),
      flags.profileV2()
        ? supabase.from('profile_facts').select('type, value, start_date, end_date, source').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (lookup.status !== 'found' || profileRes.error || !profileRes.data) return false;
    const lawsuit = lookup.lawsuit;
    if (classifyMatch(lawsuit) !== 'strong') return false;
    const row = profileRes.data as { state?: string | null; attributes?: Profile['attributes'] | null; onboarded?: boolean };
    const profile = {
      state: row.state ?? null,
      attributes: (row.attributes ?? {}) as Profile['attributes'],
      onboarded: Boolean(row.onboarded),
      facts: factsFromRows((factsRes as { data: unknown }).data as Parameters<typeof factsFromRows>[0]),
    } as Profile;
    return matchProfile(profile, [lawsuit], 0.4, now).some((result) => result.lawsuit_id === lawsuit.id);
  } catch (err) {
    logFilingError('strong-match check failed', err);
    return false;
  }
}

async function readView(
  supabase: SupabaseClient,
  userId: string,
  claimId: string,
  now: Date,
): Promise<ClaimFilingView | null> {
  try {
    const freshSignIn = await sessionHasFreshSignIn(supabase, userId, now);
    const result = await loadClaimFilingView({ supabase, userId, claimId, now, freshSignIn });
    return result.ok ? result.view : null;
  } catch (err) {
    logFilingError('claim view failed', err);
    return null;
  }
}

async function previewLane(userId: string, lawsuitId: string, now: Date): Promise<LaneView | null> {
  try {
    return (await previewLanes({ userId, lawsuitIds: [lawsuitId], now })).get(lawsuitId) ?? null;
  } catch (err) {
    logFilingError('lane preview failed', err);
    return null;
  }
}

export async function loadOneClickClaimPage(args: {
  supabase: SupabaseClient;
  userId: string;
  accountEmail: string | null;
  slug: string;
  lawsuitId: string;
  claim: ClaimView | null;
  context: SettlementContext;
  now: Date;
}): Promise<OneClickClaimProps | null> {
  if (!flags.oneClickFiling()) return null;
  const { supabase, userId, claim, context, now } = args;
  const base: OneClickClaimProps = { view: null, lane: null, canStart: false, loadFailed: false, accountEmail: args.accountEmail };
  // Only a settlement still taking claims can start one-click (the API says so too).
  const startable = context.openForClaims && !context.deadlinePassed && !context.fictional;

  if (claim) {
    const view = await readView(supabase, userId, claim.id, now);
    if (!view) return { ...base, loadFailed: isOneClickStatus(claim.status) };
    // A saved self-file claim can move to one-click once its settlement has an agent lane.
    const canStart =
      startable &&
      claim.status === 'self_file' &&
      view.lane.agent &&
      (await isStrongMatch(supabase, userId, args.slug, now));
    return { ...base, view, lane: view.lane, canStart };
  }

  if (!startable || !(await isStrongMatch(supabase, userId, args.slug, now))) return base;
  const lane = await previewLane(userId, args.lawsuitId, now);
  return { ...base, lane, canStart: Boolean(lane?.agent) };
}
