import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, RefreshCw, SearchX } from 'lucide-react';
import {
  catalogPath,
  catalogQueryString,
  filterCatalog,
  LAWSUITS_PAGE_SIZE,
  paginateCatalog,
  parseHasDeadline,
  parsePage,
  parseProofFilter,
} from '@/lib/catalog-page';
import { flags } from '@/lib/flags';
import {
  categoriesOf,
  cleanSearchTerm,
  isSettleSignalRecord,
  lookupLawsuits,
} from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import { LawsuitFilters } from '@/components/LawsuitFilters';
import { HubLinks } from '@/components/settlement/HubLinks';
import { pageUrl } from '@/lib/settlement-seo';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

const DESCRIPTION =
  'Class action settlements that are taking claims now, each with a link to its official site. Listings are not yet verified by ClaimMatch, so check the official site before you file. Filing is free.';

/** Public catalog: no per-user content. CDN / ISR cache for 15 minutes. */
export const revalidate = 900;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function catalogFilters(params: Record<string, string | string[] | undefined>) {
  return {
    q: cleanSearchTerm(firstParam(params.q)),
    category: firstParam(params.category)?.trim() || undefined,
    hasDeadline: parseHasDeadline(firstParam(params.hasDeadline)),
    proof: parseProofFilter(firstParam(params.proof)),
    page: parsePage(firstParam(params.page)),
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const filters = catalogFilters(params);
  const paginationOn = flags.lawsuitsPagination();
  // Page 2+ canonicalizes to page 1 with the same filters. Page 1 stays indexable.
  const canonicalPath = catalogPath({
    q: filters.q,
    category: filters.category,
    hasDeadline: filters.hasDeadline,
    proof: filters.proof,
    page: 1,
  });
  const title =
    paginationOn && filters.page > 1
      ? `Open Class Action Settlements (page ${filters.page})`
      : 'Open Class Action Settlements';
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: pageUrl(canonicalPath) },
    robots: { index: true, follow: true },
    openGraph: {
      title: 'Open Class Action Settlements',
      description: DESCRIPTION,
      url: pageUrl(canonicalPath),
      siteName: SITE.name,
      type: 'website',
      images: [SITE_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Open Class Action Settlements',
      description: DESCRIPTION,
      images: [SITE_OG_IMAGE.url],
    },
  };
}

export default async function LawsuitsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { q, category, hasDeadline, proof, page } = catalogFilters(params);
  const paginationOn = flags.lawsuitsPagination();

  // One query for every settlement open for claims; search and category
  // filters run on that list so the category pills always match it.
  const catalog = await lookupLawsuits();
  const categories = categoriesOf(catalog.lawsuits);
  const filteredList = filterCatalog(catalog.lawsuits, { q, category, hasDeadline, proof });
  const paged = paginateCatalog(filteredList, page, paginationOn, LAWSUITS_PAGE_SIZE);
  const count = paged.total;
  const filtered = Boolean(q || category || hasDeadline || proof);
  const showsSettleSignal = paged.items.some(isSettleSignalRecord);
  const rangeStart = count === 0 ? 0 : (paged.page - 1) * paged.pageSize + 1;
  const rangeEnd = Math.min(count, paged.page * paged.pageSize);

  const prevHref =
    paginationOn && paged.page > 1
      ? catalogPath({ q, category, hasDeadline, proof, page: paged.page - 1 })
      : null;
  const nextHref =
    paginationOn && paged.page < paged.totalPages
      ? catalogPath({ q, category, hasDeadline, proof, page: paged.page + 1 })
      : null;

  return (
    <>
      {prevHref ? <link rel="prev" href={pageUrl(prevHref)} /> : null}
      {nextHref ? <link rel="next" href={pageUrl(nextHref)} /> : null}
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

          <div className="mt-6">
            <HubLinks categories={categories} current="all" />
          </div>

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
                : paged.totalPages > 1
                  ? `Showing ${rangeStart}–${rangeEnd} of ${count} open ${count === 1 ? 'settlement' : 'settlements'}`
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
              {hasDeadline ? (
                <>
                  {' '}with a listed deadline
                </>
              ) : null}
              {proof === 'no' ? (
                <>
                  {' '}that list proof as not required
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
              <Link href={filtered ? `/lawsuits?${catalogQueryString({ q, category, hasDeadline, proof })}` : '/lawsuits'} className="btn-secondary mt-6">
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
          <>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {paged.items.map((l) => (
                <li key={l.id}>
                  <LawsuitCard lawsuit={l} />
                </li>
              ))}
            </ul>
            {paginationOn && paged.totalPages > 1 && (
              <Pagination
                page={paged.page}
                totalPages={paged.totalPages}
                q={q}
                category={category}
                hasDeadline={hasDeadline}
                proof={proof}
              />
            )}
          </>
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

function Pagination({
  page,
  totalPages,
  q,
  category,
  hasDeadline,
  proof,
}: {
  page: number;
  totalPages: number;
  q?: string;
  category?: string;
  hasDeadline: boolean;
  proof?: 'no';
}) {
  const href = (p: number) => {
    const qs = catalogQueryString({ q, category, hasDeadline, proof, page: p });
    return qs ? `/lawsuits?${qs}` : '/lawsuits';
  };
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary">
          Previous
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none opacity-50">Previous</span>
      )}
      <p className="text-sm text-ink-muted">
        Page {page} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="btn-secondary">
          Next
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none opacity-50">Next</span>
      )}
    </nav>
  );
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
