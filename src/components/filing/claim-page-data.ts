/**
 * Server only: the one-click data for /claim/[slug]. With
 * ONE_CLICK_FILING_ENABLED off it returns null before reading anything, so the
 * page behaves exactly as before. Reads go through B2's loaders
 * (src/lib/filing/v2/view.ts), which never write. Never import this from a
 * client component.
 *
 * Easy submit (`desk_file`) skips the match-score gate: any signed-in member
 * on an Easy submit settlement with an approved spec and policy can start
 * (they still answer that settlement's eligibility questions and e-sign).
 * Other settlements still require a strong match (structured who-qualifies
 * rules and matchProfile at 0.4).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaimView, SettlementContext } from '@/lib/claims';
import { flags } from '@/lib/flags';
import { oneClickEnabledFor } from '@/lib/filing/one-click-access';
import { pickNextEasySubmit } from '@/lib/filing/one-tap';
import { listClaimFilingSummaries, loadClaimFilingView, previewLanes } from '@/lib/filing/v2/view';
import type { ClaimFilingView, LaneView } from '@/lib/filing/v2/contract';
import { lookupLawsuitBySlug } from '@/lib/lawsuits';
import { classifyMatch, matchProfile } from '@/lib/matching';
import { factsFromRows } from '@/lib/profile-facts';
import type { Profile } from '@/lib/types';
import { isEasySubmitType } from '@/lib/claim-actions';
import { userHasMembershipAccess } from '@/lib/subscriptions';
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
  /** The account can sign in again with Google (see OneClickClaimProps). */
  reauthWithGoogle?: boolean;
  /** The account can sign in again with Apple. */
  reauthWithApple?: boolean;
  slug: string;
  lawsuitId: string;
  /** lawsuits.claim_action_type. Easy submit (`desk_file`) skips the match-score gate. */
  claimActionType?: string | null;
  /**
   * The settlement listing's own stated payout range, already formatted by
   * `statedPayoutLabel`. Null when the listing states no numeric amount.
   */
  payoutLabel?: string | null;
  claim: ClaimView | null;
  context: SettlementContext;
  now: Date;
}): Promise<OneClickClaimProps | null> {
  // One gate (src/lib/filing/one-click-access.ts): in test mode, INTERNAL_EMAILS testers only.
  if (!oneClickEnabledFor({ kind: 'member', email: args.accountEmail })) return null;
  const { supabase, userId, claim, context, now } = args;
  const base: OneClickClaimProps = { view: null, lane: null, canStart: false, loadFailed: false, accountEmail: args.accountEmail, reauthWithGoogle: args.reauthWithGoogle ?? false, reauthWithApple: args.reauthWithApple ?? false, payoutLabel: args.payoutLabel ?? null };
  // Only a settlement still taking claims can start one-click (the API says so too).
  const startable = context.openForClaims && !context.deadlinePassed && !context.fictional;
  const skipMatchGate = isEasySubmitType(args.claimActionType);
  const matchOk = skipMatchGate || (await isStrongMatch(supabase, userId, args.slug, now));
  const membershipOk = skipMatchGate
    ? await userHasMembershipAccess({ userId, email: args.accountEmail })
    : true;
  const needsMembership = skipMatchGate && !membershipOk;

  const nextEasySubmit = await readNextEasySubmit(supabase, userId, claim?.id ?? null, now);

  if (claim) {
    const view = await readView(supabase, userId, claim.id, now);
    if (!view) return { ...base, loadFailed: isOneClickStatus(claim.status), nextEasySubmit };
    // A saved self-file claim can move to one-click once its settlement has an agent lane.
    const eligible =
      startable &&
      claim.status === 'self_file' &&
      view.lane.agent &&
      matchOk;
    return {
      ...base,
      view,
      lane: view.lane,
      canStart: eligible && !needsMembership,
      needsMembership: eligible && needsMembership,
      nextEasySubmit,
    };
  }

  if (!startable || !matchOk) return { ...base, nextEasySubmit };
  const lane = await previewLane(userId, args.lawsuitId, now);
  const eligible = Boolean(lane?.agent);
  return {
    ...base,
    lane,
    canStart: eligible && !needsMembership,
    needsMembership: eligible && needsMembership,
    nextEasySubmit,
  };
}

async function readNextEasySubmit(
  supabase: SupabaseClient,
  userId: string,
  exceptClaimId: string | null,
  now: Date,
) {
  try {
    const list = await listClaimFilingSummaries({ supabase, userId, now });
    if (!list.ok) return null;
    return pickNextEasySubmit(list.items, exceptClaimId);
  } catch (err) {
    logFilingError('next easy submit lookup failed', err);
    return null;
  }
}
