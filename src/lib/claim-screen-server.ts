/**
 * Server-only: what /claim/[slug] shows one signed-in user. The claim page and
 * the app's claim endpoint both call it, so they cannot drift apart. The
 * settlement is read with the service role (claims-server); the claim and
 * profile with the caller's client (RLS: own rows). Never import this from a
 * client component.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PACKET_PROFILE_COLUMNS,
  toClaimFlowSettlement,
  type ClaimFlowSettlement,
  type PacketProfile,
} from '@/lib/claim-screen';
import {
  canReportWithoutClaim,
  toClaimView,
  type ClaimView,
  type SettlementContext,
} from '@/lib/claims';
import {
  UUID_RE,
  claimContext,
  loadSettlementBySlug,
  logClaimsError,
  type SettlementRecord,
} from '@/lib/claims-server';
import { assistedFilingAllowed } from '@/lib/filing/queue';
import { flags } from '@/lib/flags';
import { officialSiteUrl } from '@/lib/lawsuit-display';
import { toSelfFiledReportView, type SelfFiledReportView } from '@/lib/self-filed-report';

export type ClaimScreen =
  | { kind: 'load_error'; what: 'this settlement' | 'your claim' }
  | { kind: 'not_found' }
  | {
      kind: 'closed';
      settlement: SettlementRecord;
      context: SettlementContext;
      claim: null;
      officialUrl: string | null;
    }
  | {
      kind: 'flow';
      settlement: SettlementRecord;
      context: SettlementContext;
      claim: ClaimView | null;
      profile: PacketProfile | null;
      flowSettlement: ClaimFlowSettlement;
      selfFiledReport: SelfFiledReportView | null;
    };

export async function loadClaimScreen(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  now: Date,
): Promise<ClaimScreen> {
  const lookup = await loadSettlementBySlug(slug);
  // A failed read is not "taken down": someone coming back from the official
  // site to report filing gets a retry, never a 404.
  if (!lookup.ok) return { kind: 'load_error', what: 'this settlement' };
  const settlement = lookup.settlement;
  if (!settlement || !UUID_RE.test(settlement.id)) return { kind: 'not_found' };

  const context = claimContext(settlement, now);
  const [{ data: claimRow, error: claimError }, { data: profileRow }] = await Promise.all([
    supabase.from('claims').select('*').eq('user_id', userId).eq('lawsuit_id', settlement.id).maybeSingle(),
    supabase.from('profiles').select(PACKET_PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
  ]);
  if (claimError) logClaimsError('claim page lookup failed', claimError);
  const claim = claimRow ? toClaimView(claimRow as Record<string, unknown>) : null;
  const profile = (profileRow as PacketProfile | null) ?? null;

  if (claimError) return { kind: 'load_error', what: 'your claim' };
  if (!claim && (!context.published || context.fictional)) return { kind: 'not_found' };

  // Without a claim, a settlement that no longer takes claims still lets people
  // tell us they filed (the deadline-passed or "closed on our list" card) until
  // 30 days after its deadline. Only after that is there nothing left to do.
  if (!claim && !context.openForClaims && !canReportWithoutClaim(context)) {
    return { kind: 'closed', settlement, context, claim: null, officialUrl: officialSiteUrl(settlement.claim_url) };
  }

  const flowSettlement = toClaimFlowSettlement(settlement, {
    assistedFilingAllowed: assistedFilingAllowed(
      { assisted_filing_allowed: Boolean((settlement as { assisted_filing_allowed?: boolean }).assisted_filing_allowed) },
      flags.assistedFiling(),
    ),
    payoutReportEnabled: flags.payoutReport(),
    claimTimelineEnabled: flags.claimTimeline(),
    selfFiledReportEnabled: flags.selfFiledReport(),
  });
  let selfFiledReport: SelfFiledReportView | null = null;
  if (flags.selfFiledReport()) {
    const { data: reportRow, error: reportError } = await supabase
      .from('self_filed_reports')
      .select('id, lawsuit_id, claim_id, confirmation_storage_path, confirmation_mime, confirmation_bytes')
      .eq('user_id', userId)
      .eq('lawsuit_id', settlement.id)
      .maybeSingle();
    if (reportError) logClaimsError('self-filed report lookup failed', reportError);
    else if (reportRow) selfFiledReport = toSelfFiledReportView(reportRow as Parameters<typeof toSelfFiledReportView>[0]);
  }
  return { kind: 'flow', settlement, context, claim, profile, flowSettlement, selfFiledReport };
}
