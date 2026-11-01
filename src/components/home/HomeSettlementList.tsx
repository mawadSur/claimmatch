import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';
import { isOpenForClaims } from '@/lib/lawsuits';

export function HomeSettlementList({ lawsuits }: { lawsuits: Lawsuit[] }) {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      {lawsuits.map((lawsuit) => {
        const open = isOpenForClaims(lawsuit);
        return (
          <li key={lawsuit.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link
                href={`/lawsuits/${lawsuit.slug}`}
                className="font-semibold text-ink hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {lawsuit.title}
              </Link>
              <p className="mt-1 text-sm text-ink-muted">{lawsuit.category}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Payout</dt>
                  <dd className="font-semibold text-gold-700">
                    {lawsuit.typical_payout?.trim() || 'Not stated'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Deadline</dt>
                  <dd className="font-semibold text-ink">
                    {lawsuit.deadline ? formatDeadline(lawsuit.deadline) : 'No deadline listed'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {open ? (
                <Link href={`/claim/${lawsuit.slug}`} className="btn-primary w-full sm:w-auto">
                  Start your claim
                  <span className="sr-only"> for {lawsuit.title}</span>
                </Link>
              ) : (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-ink-muted">
                  Claims closed
                </p>
              )}
              <Link
                href={`/lawsuits/${lawsuit.slug}`}
                className="inline-flex min-h-tap items-center justify-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                Details <ArrowRight className="h-4 w-4" aria-hidden />
                <span className="sr-only"> about {lawsuit.title}</span>
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
