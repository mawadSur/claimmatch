import { BadgeCheck } from 'lucide-react';
import type { VerificationCoverage } from '@/lib/verification-coverage';

function fmt(n: number): string {
  return n.toLocaleString();
}

/**
 * Measured verification coverage. Counts only; hidden unless the assist flag
 * is on. Never claims listings are "AI verified".
 */
export function VerificationCoverageCard({ coverage }: { coverage: VerificationCoverage }) {
  const pct =
    coverage.verifiedPercent == null ? '—' : `${coverage.verifiedPercent}% of ${fmt(coverage.openPublished)}`;
  return (
    <section aria-labelledby="verify-coverage-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
          <BadgeCheck className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 id="verify-coverage-title" className="text-lg font-bold text-ink">
            Verification coverage
          </h3>
          <p className="text-sm text-ink-soft">
            Measured catalog counts. Match alerts only go to verified open listings.
          </p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <dt className="text-xs font-medium text-ink-muted">Open published</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{fmt(coverage.openPublished)}</dd>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <dt className="text-xs font-medium text-ink-muted">Verified</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{fmt(coverage.verified)}</dd>
          <dd className="mt-0.5 text-xs text-ink-soft">{pct}</dd>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <dt className="text-xs font-medium text-ink-muted">Pending review</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{fmt(coverage.pendingReview)}</dd>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <dt className="text-xs font-medium text-ink-muted">Eligible for match alerts</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{fmt(coverage.alertEligible)}</dd>
        </div>
      </dl>
    </section>
  );
}
