import Link from 'next/link';
import { ArrowRight, ShieldCheck, FileCheck } from 'lucide-react';
import { categoryHubPath } from '@/lib/settlement-seo';

/**
 * Home wedge entry points. No match language. Hidden unless a flag is on
 * and the live catalog has at least one listing for that filter.
 */
export function HomeNarrowing({
  showBreachPrivacy = true,
  showDataBreach = true,
  showPrivacy = true,
  showNoProof = true,
}: {
  showBreachPrivacy?: boolean;
  showDataBreach?: boolean;
  showPrivacy?: boolean;
  showNoProof?: boolean;
}) {
  const breachCard = showBreachPrivacy && (showDataBreach || showPrivacy);
  if (!breachCard && !showNoProof) return null;

  return (
    <section className="container-page py-16 sm:py-20" aria-labelledby="narrowing-heading">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="narrowing-heading" className="font-display text-3xl font-extrabold sm:text-4xl">
          Start with a type of settlement
        </h2>
        <p className="mt-3 text-ink-muted">
          Browse listings we already have. You still check the official notice
          before you file.
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {breachCard && (
          <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold">Data breach &amp; privacy</h3>
            <p className="mt-2 text-sm text-ink-muted">
              Open listings in those categories, with the official link when we have it.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {showDataBreach && (
                <Link href={categoryHubPath('Data Breach')} className="btn-secondary !py-2 text-sm">
                  Data breach <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
              {showPrivacy && (
                <Link href={categoryHubPath('Privacy')} className="btn-secondary !py-2 text-sm">
                  Privacy <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          </article>
        )}
        {showNoProof && (
          <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <FileCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold">No proof required</h3>
            <p className="mt-2 text-sm text-ink-muted">
              Listings whose source says you do not need receipts or records.
              Confirm that on the official notice.
            </p>
            <Link href="/lawsuits?proof=no" className="btn-secondary mt-5 !py-2 text-sm">
              Browse no-proof listings <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        )}
      </div>
    </section>
  );
}
