'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { HomeSettlementCard } from '@/lib/home-catalog';
import { HomeSettlementList } from './HomeSettlementList';

/**
 * Homepage catalog blocks as a client island (ssr:true). Same visible copy as
 * the server tree on src/app/page.tsx; RSC then carries card props instead of
 * the className soup. Used only when HOME_HTML_TRIM_ENABLED=1.
 */
export function HomeTrimCatalog({
  top,
  closing,
  closingFailed,
  openingSoon,
  easySubmitIds,
  closesInChips,
  claimActionCtas,
  verifiedFields,
  catalogHideUnknowns,
  noticeChecked,
}: {
  top: HomeSettlementCard[];
  closing: HomeSettlementCard[];
  closingFailed: boolean;
  openingSoon: HomeSettlementCard[];
  easySubmitIds: readonly string[];
  closesInChips: boolean;
  claimActionCtas: boolean;
  verifiedFields: boolean;
  catalogHideUnknowns: boolean;
  noticeChecked: Readonly<Record<string, string | null>>;
}) {
  const listProps = {
    easySubmitIds,
    closesInChips,
    claimActionCtas,
    verifiedFields,
    catalogHideUnknowns,
    noticeChecked,
  };
  return (
    <>
      {top.length > 0 && (
        <section className="section-y bg-brand-50" aria-labelledby="top-heading">
          <div className="container-page">
            <div
              className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
              data-reveal
            >
              <div>
                <p className="eyebrow">Top open settlements</p>
                <h2 id="top-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                  Biggest payouts still open
                </h2>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                  Open settlements with the highest payout each listing states. Actual payments
                  depend on the settlement, so check the official notice.
                </p>
              </div>
              <Link href="/lawsuits" className="btn-secondary shrink-0">
                See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-8">
              <HomeSettlementList lawsuits={top} {...listProps} />
            </div>
          </div>
        </section>
      )}

      <section className="section-y bg-white" aria-labelledby="open-heading">
        <div className="container-page">
          <div
            className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
            data-reveal
          >
            <div>
              <p className="eyebrow">Closing soon</p>
              <h2 id="open-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                Open settlements
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                Nearest deadlines first. Payout amounts and deadlines as the listing states them.
              </p>
            </div>
            <Link href="/lawsuits" className="btn-secondary shrink-0">
              See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {closingFailed ? (
            <div
              role="alert"
              className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
            >
              <AlertCircle className="h-8 w-8 text-danger-700" aria-hidden />
              <p className="mt-3 font-semibold text-ink">
                We couldn’t load settlements right now.
              </p>
              <p className="mt-1 text-sm text-ink-muted">Please try again in a moment.</p>
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Go to all settlements
              </Link>
            </div>
          ) : closing.length === 0 ? (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="font-semibold text-ink">No deadlines coming up right now.</p>
              <p className="mt-1 text-sm text-ink-muted">
                New settlements open all the time. See everything that is open today.
              </p>
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Browse open settlements
              </Link>
            </div>
          ) : (
            <div className="mt-6">
              <HomeSettlementList lawsuits={closing} {...listProps} />
            </div>
          )}
        </div>
      </section>

      {openingSoon.length > 0 && (
        <section className="section-y bg-white" aria-labelledby="opening-soon-home-heading">
          <div className="container-page">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" data-reveal>
              <div>
                <p className="eyebrow">Not taking claims yet</p>
                <h2 id="opening-soon-home-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                  Opening soon
                </h2>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                  These listings are published but not open for claims on Lawsuit AI yet.
                </p>
              </div>
              <Link href="/lawsuits?openingSoon=1" className="btn-secondary shrink-0">
                See opening soon <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-8">
              <HomeSettlementList lawsuits={openingSoon} {...listProps} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
