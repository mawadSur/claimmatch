import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingSummary } from '@/lib/filing/v2/contract';
import { formatDeadline } from '@/lib/utils';
import { ClaimStatusBadge } from '@/components/claims/ClaimStatusBadge';
import { filingStatusDisplay, oneClickSummaries, summaryCounts } from './filing-model';

const COPY = ONE_CLICK_COPY.dashboard;

/**
 * Dashboard "Filing status": the member's one-click claims with their status
 * and a "Ready to file" count. Self-file claims stay under "Your claims".
 * Null items mean the list could not be read.
 */
export function FilingSummaryList({ items }: { items: readonly ClaimFilingSummary[] | null }) {
  if (items === null) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger-50 bg-white p-5 text-sm shadow-card">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
        <p className="text-ink-muted">{COPY.failed}</p>
      </div>
    );
  }
  const list = oneClickSummaries(items);
  if (list.length === 0) return null;
  const counts = summaryCounts(list);
  return (
    <section aria-labelledby="filing-summary-title">
      <h2 id="filing-summary-title" className="text-2xl font-extrabold">
        {COPY.title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>
      <dl className="mt-4 flex flex-wrap gap-3">
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-card">
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">{COPY.ready}</dt>
          <dd className="mt-1 text-2xl font-extrabold text-ink">{counts.ready}</dd>
        </div>
        {counts.needsYou > 0 && (
          <div className="rounded-xl border border-danger-50 bg-white px-4 py-3 shadow-card">
            <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">{COPY.needsYou}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-danger-700">{counts.needsYou}</dd>
          </div>
        )}
      </dl>
      <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        {list.map((item) => {
          const display = filingStatusDisplay(item.status, item.confirmation_number);
          return (
            <li key={item.claim_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <div className="min-w-0">
                <ClaimStatusBadge label={display.label} tone={display.tone} />
                <p className="mt-2 font-semibold text-ink">{item.title}</p>
                {item.deadline && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
                    <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                    {formatDeadline(item.deadline)}
                  </p>
                )}
              </div>
              <Link
                href={`/claim/${item.slug}#one-click`}
                className={`${item.needs_action ? 'btn-primary' : 'btn-secondary'} shrink-0 !px-4 !py-2 text-sm`}
                aria-label={`${COPY.open}: ${item.title}`}
              >
                {COPY.open} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
