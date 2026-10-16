import Link from 'next/link';
import { ArrowRight, FileSearch } from 'lucide-react';
import { CLAIM_GROUP_LABELS, type ClaimGroup } from '@/lib/claims';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { GROUP_ORDER, type DashboardRow } from './dashboard-model';

const GROUP_HINT: Record<ClaimGroup, string> = {
  needs_filing: 'File these on the official site before the deadline.',
  reported: 'You told us you filed. Add the confirmation number when you get it.',
  submitted: 'Filed, with the administrator’s confirmation number on record.',
  closed: 'The deadline passed, or there is nothing left to do.',
  other: 'We can’t show these right now.',
};

/** "Your claims", grouped by next step. Server-safe. */
export function ClaimList({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <FileSearch className="h-6 w-6" aria-hidden />
        </div>
        <h3 className="mt-4 text-lg font-bold">You&rsquo;re not tracking any claims yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          Find an open settlement, check the official notice to see if it applies to
          you, and file on the official site. Then tell us you filed, and your claim
          shows up here with its deadline and confirmation number.
        </p>
        <Link href="/lawsuits" className="btn-primary mt-6">
          Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {GROUP_ORDER.map((group) => {
        const items = rows.filter((r) => r.group === group);
        if (items.length === 0) return null;
        const headingId = `claims-${group}`;
        return (
          <section key={group} aria-labelledby={headingId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={headingId} className="text-base font-bold">
                {`${CLAIM_GROUP_LABELS[group]} (${items.length})`}
              </h3>
              <p className="text-sm text-ink-muted">{GROUP_HINT[group]}</p>
            </div>
            <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
              {items.map((row) => (
                <li
                  key={row.claimId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{row.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <ClaimStatusBadge label={row.label} tone={row.tone} />
                      <span className="text-sm text-ink-muted">{row.deadlineText}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{row.nextStep}</p>
                  </div>
                  {row.action && (
                    <Link
                      href={row.action.href}
                      className="btn-secondary shrink-0 !px-4 !py-2 text-sm"
                      aria-label={`${row.action.label}: ${row.title}`}
                    >
                      {row.action.label} <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
