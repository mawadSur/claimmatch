import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { deadlineUrgencyLabel, formatDeadline } from '@/lib/utils';
import { isOpenForClaims } from '@/lib/lawsuits';
import { flags } from '@/lib/flags';
import { ClosesInChip } from '@/components/settlement/ClosesInChip';

/** "Jan" / "22" for the calendar badge. Deadlines are calendar dates, so read them as UTC. */
function badgeParts(deadline: string | null): { month: string; day: string } | null {
  if (!deadline) return null;
  const d = new Date(`${deadline.trim().slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
  };
}

export function HomeSettlementList({ lawsuits }: { lawsuits: Lawsuit[] }) {
  return (
    <ul className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      {lawsuits.map((lawsuit, i) => {
        const open = isOpenForClaims(lawsuit);
        const urgency = open ? deadlineUrgencyLabel(lawsuit.deadline) : null;
        const badge = badgeParts(lawsuit.deadline);
        return (
          <li
            key={lawsuit.id}
            data-reveal
            style={{ '--reveal-at': i * 4 } as CSSProperties}
            className="flex flex-col gap-5 p-5 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6"
          >
            <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
              {badge && (
                <div
                  aria-hidden
                  className="w-14 shrink-0 overflow-hidden rounded-xl bg-white text-center shadow-sm ring-1 ring-slate-200"
                >
                  <div className="bg-brand-700 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                    {badge.month}
                  </div>
                  <div className="py-1.5 font-display text-2xl font-medium leading-none text-ink">
                    {badge.day}
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {lawsuit.category}
                  </span>
                  <ClosesInChip deadline={lawsuit.deadline} />
                  {!flags.closesInChips() && urgency && (
                    <span className="badge-red gap-1">
                      <Clock className="h-3 w-3" aria-hidden /> {urgency}
                    </span>
                  )}
                </div>
                <Link
                  href={`/lawsuits/${lawsuit.slug}`}
                  className="mt-1 block rounded text-lg font-semibold leading-snug text-ink hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {lawsuit.title}
                </Link>
                <dl className="mt-2.5 grid gap-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_11.5rem] sm:gap-x-8">
                  <div className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 text-ink-muted">Payout</dt>
                    <dd className="line-clamp-2 font-semibold text-gold-700">
                      {lawsuit.typical_payout?.trim() || 'Not stated'}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-muted">Deadline</dt>
                    <dd className="font-semibold text-ink">
                      {lawsuit.deadline ? formatDeadline(lawsuit.deadline) : 'No deadline listed'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:items-end">
              {open ? (
                <Link href={`/claim/${lawsuit.slug}`} className="btn-primary w-full !py-2.5 sm:w-auto">
                  Start your claim
                  <span className="sr-only"> for {lawsuit.title}</span>
                </Link>
              ) : (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-ink-muted">
                  Claims closed
                </p>
              )}
              <Link
                href={`/lawsuits/${lawsuit.slug}`}
                className="inline-flex min-h-tap items-center justify-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
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
