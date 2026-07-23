import { Fragment } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Hash,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { Claim, ClaimStatus, Recovery, RecoveryStatus } from '@/lib/types';
import { CLAIM_STATUS_LABELS } from '@/lib/types';
import { formatUSD } from '@/lib/recovery';

/**
 * The recovery pipeline — an honest, receipt-style tracker for every claim the
 * user is filing through ClaimMatch. Server-safe (no hooks). Shows the
 * Submitted → Under review → Approved → Paid pipeline, tracking reference,
 * estimated value, and (once a recovery is opened) how much the user recovered.
 * ClaimMatch is free and takes no cut, so the amount recovered is theirs to keep.
 */
const PIPELINE = ['Submitted', 'Under review', 'Approved', 'Paid'] as const;

function stageIndex(status: ClaimStatus): number {
  switch (status) {
    case 'submitted':
      return 0;
    case 'processing':
      return 1;
    case 'approved':
      return 2;
    case 'paid':
      return 3;
    default:
      return -1; // rejected — no pipeline
  }
}

export function RecoveryTracker({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <Wallet className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold">No money yet — that&rsquo;s normal</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          Once you file a claim it shows up here, and we&rsquo;ll track it all the
          way to payout. Settlements move slowly — most take{' '}
          <span className="font-semibold text-ink">6 to 18 months</span> to pay
          out after filing. We&rsquo;ll pre-fill your claims and email you at
          every step.
        </p>
        <Link href="/lawsuits" className="btn-primary mt-6">
          Browse settlements <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {claims.map((claim) => (
        <RecoveryRow key={claim.id} claim={claim} />
      ))}
      <p className="pt-1 text-center text-xs text-ink-soft">
        Settlements typically take{' '}
        <span className="tabular-nums">6&ndash;18</span> months to pay out. When
        yours does, the administrator pays you directly — ClaimMatch never takes a
        cut.
      </p>
    </div>
  );
}

function RecoveryRow({ claim }: { claim: Claim }) {
  const title = claim.lawsuit?.title ?? claim.lawsuit_title;
  const rejected = claim.status === 'rejected';
  const current = stageIndex(claim.status);
  const recovery = claim.recovery;

  return (
    <article className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-card-hover sm:p-6">
      {/* Header --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-ink">
            {claim.lawsuit ? (
              <Link
                href={`/lawsuits/${claim.lawsuit.slug}`}
                className="hover:text-brand-700"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" /> Receipt{' '}
              <span className="tabular-nums">#{claim.receipt_number}</span>
            </span>
            {claim.estimated_value != null && (
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" /> Est. value{' '}
                <span className="font-semibold tabular-nums text-success-600">
                  {formatUSD(claim.estimated_value)}
                </span>
              </span>
            )}
          </div>
        </div>
        <span
          className={
            rejected
              ? 'badge-red'
              : claim.status === 'paid' || claim.status === 'approved'
                ? 'badge-green'
                : 'badge-brand'
          }
        >
          {CLAIM_STATUS_LABELS[claim.status]}
        </span>
      </div>

      {/* Pipeline ------------------------------------------------------------- */}
      {rejected ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <XCircle className="h-4 w-4 shrink-0" />
          This claim wasn&rsquo;t eligible. ClaimMatch is always free — we&rsquo;ll
          keep watching for others you qualify for.
        </div>
      ) : (
        <ol className="mt-5 flex items-start">
          {PIPELINE.map((label, i) => {
            const done = i < current;
            const active = i === current;
            const reached = i <= current;
            const isPaidStep = i === 3;
            return (
              <Fragment key={label}>
                <li className="flex w-14 shrink-0 flex-col items-center gap-1.5 sm:w-24">
                  <div
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums transition ${
                      reached
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-ink-soft'
                    } ${active ? 'ring-4 ring-brand-100' : ''}`}
                  >
                    {done || (active && isPaidStep) ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-center text-[11px] font-semibold leading-tight ${
                      active
                        ? 'text-brand-700'
                        : reached
                          ? 'text-brand-600'
                          : 'text-ink-soft'
                    }`}
                  >
                    {label}
                  </span>
                </li>
                {i < PIPELINE.length - 1 && (
                  <div
                    className={`mt-[13px] h-1 flex-1 rounded-full ${
                      i < current ? 'bg-brand-600' : 'bg-gray-100'
                    }`}
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
      )}

      {/* Money breakdown ------------------------------------------------------ */}
      {recovery ? (
        <MoneyBreakdown recovery={recovery} />
      ) : (
        !rejected && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-xs text-ink-muted">
            <Clock className="h-4 w-4 shrink-0 text-ink-soft" />
            No funds received yet. Settlements typically pay out 6&ndash;18
            months after filing — we&rsquo;ll notify you the moment yours does.
          </div>
        )
      )}
    </article>
  );
}

function MoneyBreakdown({ recovery }: { recovery: Recovery }) {
  // ClaimMatch takes no cut, so what you keep equals what the settlement paid.
  const net = recovery.net_amount ?? recovery.gross_amount;
  return (
    <div className="mt-5 grid gap-3 rounded-xl bg-success-50 p-4 sm:grid-cols-2">
      <Money label="Settlement paid" value={formatUSD(recovery.gross_amount)} />
      <Money label="Yours to keep" value={formatUSD(net)} accent />
      <div className="sm:col-span-2">
        <span className={recoveryBadgeClass(recovery.status)}>
          {RECOVERY_STATUS_LABELS[recovery.status] ?? recovery.status}
        </span>
      </div>
    </div>
  );
}

function Money({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-extrabold tabular-nums ${
          accent ? 'text-success-700' : muted ? 'text-ink-muted' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  pending: 'Awaiting settlement',
  awaiting_payout: 'Payout on the way',
  paid: 'Paid out to you',
  denied: 'Denied',
};

function recoveryBadgeClass(status: RecoveryStatus): string {
  switch (status) {
    case 'paid':
      return 'badge-green';
    case 'denied':
      return 'badge-red';
    default:
      return 'badge-brand';
  }
}
