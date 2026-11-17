import {
  OWED_ESTIMATE_ASSUMPTION,
  owedRangeLabel,
  unstatedPayoutCopy,
  type OwedEstimate,
} from '@/lib/owed-estimate';

/**
 * Signed-in matches dashboard header. Hidden unless the caller already
 * decided at least one open match has a listed payout.
 */
export function OwedEstimateHeader({ estimate }: { estimate: OwedEstimate }) {
  const unstated = unstatedPayoutCopy(estimate.unstatedCount);
  return (
    <div
      className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-card"
      data-testid="owed-estimate-header"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-800">You might be owed</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">
        Estimated {owedRangeLabel(estimate)}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{OWED_ESTIMATE_ASSUMPTION}</p>
      {unstated ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{unstated}.</p> : null}
    </div>
  );
}
