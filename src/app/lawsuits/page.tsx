import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, RefreshCw, SearchX } from 'lucide-react';
import {
  categoriesOf,
  cleanSearchTerm,
  isSettleSignalRecord,
  lookupLawsuits,
  searchCatalog,
} from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import { LawsuitFilters } from '@/components/LawsuitFilters';
import { SITE } from '@/lib/utils';

const DESCRIPTION =
  'Class action settlements that are taking claims now, each with a link to its official site. Listings are not yet verified by ClaimMatch, so check the official site before you file. Filing is free.';

export const metadata: Metadata = {
  title: 'Open Class Action Settlements',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE.url.replace(/\/$/, '')}/lawsuits` },
  openGraph: {
    title: 'Open Class Action Settlements — ClaimMatch',
    description: DESCRIPTION,
    url: `${SITE.url.replace(/\/$/, '')}/lawsuits`,
    siteName: SITE.name,
    type: 'website',
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LawsuitsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = cleanSearchTerm(firstParam(params.q));
  const category = firstParam(params.category)?.trim() || undefined;

  // One query for every settlement open for claims; search and category
  // filters run on that list so the category pills always match it.
  const catalog = await lookupLawsuits();
  const categories = categoriesOf(catalog.lawsuits);
  const lawsuits = searchCatalog(catalog.lawsuits, { q, category });
  const count = lawsuits.length;
  const filtered = Boolean(q || category);
  const showsSettleSignal = lawsuits.some(isSettleSignalRecord);

  return (
    <>
      {/* Header ------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-12 sm:py-16">
          <span className="badge-brand gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Updated daily
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            Open settlements
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            Class action settlements that are taking claims now. Check who qualifies on
            the official site, file there for free, and keep track of your claim in
            ClaimMatch.
          </p>

          <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="text-sm text-amber-900">
              <p className="font-bold">Unverified: check the official site</p>
              <p className="mt-1">
                These listings come from public sources, and we haven’t checked them
                against the official notices yet. Each one links to the official site, or
                to where we found it. Confirm the details there before you file.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters + results -------------------------------------------------- */}
      <section className="container-page py-10">
        <Suspense
          fallback={
            <div className="h-[7.5rem] rounded-2xl border border-gray-100 bg-white shadow-card" />
          }
        >
          <LawsuitFilters categories={categories} />
        </Suspense>

        <p className="mt-6 text-sm text-ink-muted" role="status" aria-live="polite">
          {catalog.error ? (
            'Settlements didn’t load.'
          ) : (
            <>
              {count === 0
                ? 'No open settlements found'
                : `Showing ${count} open ${count === 1 ? 'settlement' : 'settlements'}`}
              {category ? (
                <>
                  {' '}in <span className="font-semibold text-ink">{category}</span>
                </>
              ) : null}
              {q ? (
                <>
                  {' '}matching “<span className="font-semibold text-ink">{q}</span>”
                </>
              ) : null}
            </>
          )}
        </p>

        {catalog.error ? (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />}
            title="We couldn’t load settlements right now"
            body="This is on our side. Please try again in a few minutes."
            action={
              <Link href={filtered ? `/lawsuits?${toQuery(q, category)}` : '/lawsuits'} className="btn-secondary mt-6">
                Try again
              </Link>
            }
          />
        ) : count === 0 ? (
          <EmptyState
            icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
            title={filtered ? 'No open settlements match your search' : 'No open settlements to show right now'}
            body={
              filtered
                ? 'Try a different word, or clear your filters to see every open settlement.'
                : 'Check back soon. We update this list every day.'
            }
            action={
              filtered ? (
                <Link href="/lawsuits" className="btn-secondary mt-6">
                  Clear filters
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lawsuits.map((l) => (
              <li key={l.id}>
                <LawsuitCard lawsuit={l} />
              </li>
            ))}
          </ul>
        )}

        {showsSettleSignal && (
          <p className="mt-10 text-xs text-ink-muted">
            Listings from SettleSignal are adapted from{' '}
            <a
              href="https://settlesignal.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              SettleSignal (settlesignal.com)
            </a>{' '}
            under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              CC BY 4.0
            </a>
            . ClaimMatch may have shortened or reformatted them.
          </p>
        )}
      </section>
    </>
  );
}

function toQuery(q: string | undefined, category: string | undefined): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  return params.toString();
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{body}</p>
      {action}
    </div>
  );
}
