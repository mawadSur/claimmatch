'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { HomeSettlementCard } from '@/lib/home-catalog';
import { HomeSettlementList } from './HomeSettlementList';

/**
 * Compact homepage catalog teaser as a client island (ssr:true). RSC then
 * carries card props instead of the className-heavy list markup.
 */
export function HomeBrowseTeaser({
  cards,
  failed,
  easySubmitIds,
  closesInChips,
  claimActionCtas,
  verifiedFields,
  catalogHideUnknowns,
  noticeChecked,
}: {
  cards: HomeSettlementCard[];
  failed: boolean;
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
    <section className="section-y bg-white" aria-labelledby="browse-heading">
      <div className="container-page">
        <div
          className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          data-reveal
        >
          <div>
            <p className="eyebrow">Browse settlements</p>
            <h2 id="browse-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
              A few open listings
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Nearest deadlines first. Payouts and dates as each listing states them.
            </p>
          </div>
          <Link href="/lawsuits" className="btn-secondary shrink-0">
            See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {failed ? (
          <div
            role="alert"
            className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
          >
            <AlertCircle className="h-8 w-8 text-danger-700" aria-hidden />
            <p className="mt-3 font-semibold text-ink">We couldn’t load settlements right now.</p>
            <p className="mt-1 text-sm text-ink-muted">Please try again in a moment.</p>
            <Link href="/lawsuits" className="btn-secondary mt-6">
              Go to all settlements
            </Link>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="font-semibold text-ink">No open settlements to preview right now.</p>
            <p className="mt-1 text-sm text-ink-muted">
              New settlements open all the time. See everything that is listed today.
            </p>
            <Link href="/lawsuits" className="btn-secondary mt-6">
              Browse open settlements
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <HomeSettlementList lawsuits={cards} {...listProps} />
          </div>
        )}
      </div>
    </section>
  );
}
