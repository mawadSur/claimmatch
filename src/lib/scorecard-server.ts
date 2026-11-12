/**
 * Server-only scorecard counts. Service role so is_internal can be applied.
 * Never import from a client component.
 */
import { getLawsuits } from '@/lib/lawsuits';
import {
  buildScorecard,
  countExcludingInternal,
  sumPayoutsExcludingInternal,
  type ScorecardStats,
} from '@/lib/scorecard';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

const FILED_STATUSES = ['reported_filed', 'submitted'] as const;

const EMPTY: ScorecardStats = buildScorecard({
  openSettlementCount: 0,
  filedClaimCount: 0,
  payoutCount: 0,
  payoutTotalAmount: 0,
});

export async function loadScorecardStats(): Promise<ScorecardStats> {
  let openSettlementCount = 0;
  try {
    const lawsuits = await getLawsuits();
    openSettlementCount = lawsuits.length;
  } catch (err) {
    console.error('[scorecard] open settlements failed', err);
  }

  if (!isSupabaseConfigured()) {
    return buildScorecard({
      openSettlementCount,
      filedClaimCount: 0,
      payoutCount: 0,
      payoutTotalAmount: 0,
    });
  }

  try {
    const svc = createServiceClient();
    const [{ data: internalRows, error: internalError }, { data: claimRows, error: claimError }, { data: payoutRows, error: payoutError }] =
      await Promise.all([
        svc.from('profiles').select('id').eq('is_internal', true),
        svc.from('claims').select('id, user_id').in('status', [...FILED_STATUSES]),
        svc.from('recoveries').select('id, user_id, gross_amount').eq('source', 'user_reported'),
      ]);

    if (internalError) throw new Error(internalError.message);
    if (claimError) throw new Error(claimError.message);
    if (payoutError) throw new Error(payoutError.message);

    const internalIds = new Set(
      ((internalRows ?? []) as Array<{ id: string }>).map((row) => row.id),
    );
    const filedClaimCount = countExcludingInternal(
      (claimRows ?? []) as Array<{ user_id?: string | null }>,
      internalIds,
    );
    const payouts = sumPayoutsExcludingInternal(
      (payoutRows ?? []) as Array<{ user_id?: string | null; gross_amount?: number | string | null }>,
      internalIds,
    );

    return buildScorecard({
      openSettlementCount,
      filedClaimCount,
      payoutCount: payouts.count,
      payoutTotalAmount: payouts.total,
    });
  } catch (err) {
    console.error('[scorecard] counts failed', err);
    return buildScorecard({
      openSettlementCount,
      filedClaimCount: 0,
      payoutCount: 0,
      payoutTotalAmount: 0,
    });
  }
}

export { EMPTY as emptyScorecard };
