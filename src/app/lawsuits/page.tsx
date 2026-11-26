import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { RefreshCw, SearchX } from 'lucide-react';
import {
  catalogPath,
  catalogQueryString,
  filterCatalog,
  LAWSUITS_PAGE_SIZE,
  paginateCatalog,
  parseFileForYou,
  parseHasDeadline,
  parseOpeningSoon,
  parsePage,
  parseProofFilter,
} from '@/lib/catalog-page';
import { CatalogPagination } from '@/components/CatalogPagination';
import { flags } from '@/lib/flags';
import {
  categoriesOf,
  cleanSearchTerm,
  isSettleSignalRecord,
  lookupLawsuits,
} from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import { LawsuitFilters } from '@/components/LawsuitFilters';
import { AccountMatchBanner } from '@/components/match-preview/AccountMatchBanner';
import { HubLinks } from '@/components/settlement/HubLinks';
import { pageUrl } from '@/lib/settlement-seo';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';
import { CATALOG_INTRO_MAY_FILE, CATALOG_INTRO_NEVER_FILES, lawsuitAiMayFile } from '@/lib/copy';
import { oneClickLawsuitIdSet } from '@/lib/one-click-listings';

const DESCRIPTION =
  'Class action settlements that are taking claims now, each with a link to its official site. Listings are not yet verified by Lawsuit AI, so check the official site before you file. Filing is free.';

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
    fileForYou: parseFileForYou(firstParam(params.fileForYou)),
    openingSoon: parseOpeningSoon(firstParam(params.openingSoon)),
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
  const canonicalPath = catalogPath({
    q: filters.q,
    category: filters.category,
    hasDeadline: filters.hasDeadline,
    proof: filters.proof,
    fileForYou: filters.fileForYou,
    openingSoon: filters.openingSoon,
    page: filters.page,
  });
  const title =
    filters.page > 1
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
  const { q, category, hasDeadline, proof, fileForYou, openingSoon, page } = catalogFilters(params);

  // One query for every settlement open for claims; search and category
  // filters run on that list so the category pills always match it. HTML is
  // sliced per page so the catalog stays cacheable. `not_open` rows live in
  // openingSoon, not the default list.
  const catalog = await lookupLawsuits();
  const categories = categoriesOf([...catalog.lawsuits, ...catalog.openingSoon]);
  const fileForYouIds = await oneClickLawsuitIdSet();
  const sourceList = openingSoon ? catalog.openingSoon : catalog.lawsuits;
  const filteredList = filterCatalog(sourceList, {
    q,
    category,
    hasDeadline,
    proof,
    fileForYou,
    fileForYouIds,
  });
  const paged = paginateCatalog(filteredList, page, true, LAWSUITS_PAGE_SIZE);
  const count = paged.total;
  const filtered = Boolean(q || category || hasDeadline || proof || fileForYou || openingSoon);
  const mayFile = lawsuitAiMayFile();
  const showsSettleSignal = paged.items.some(isSettleSignalRecord);
  const rangeStart = count === 0 ? 0 : (paged.page - 1) * paged.pageSize + 1;
  const rangeEnd = Math.min(count, paged.page * paged.pageSize);
  const openingSoonPreview =
    !openingSoon && !q && !category && !hasDeadline && !proof && !fileForYou && page <= 1
      ? catalog.openingSoon.slice(0, 3)
      : [];

  const prevHref =
    paged.page > 1
      ? catalogPath({ q, category, hasDeadline, proof, fileForYou, openingSoon, page: paged.page - 1 })
      : null;
  const nextHref =
    paged.page < paged.totalPages
      ? catalogPath({ q, category, hasDeadline, proof, fileForYou, openingSoon, page: paged.page + 1 })
      : null;

  return (
    <>
      <section className="border-b border-slate-200/70 bg-white">
        <div className="container-page py-6 sm:py-14">
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
            {openingSoon ? 'Opening soon' : 'Open settlements'}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            {mayFile ? CATALOG_INTRO_MAY_FILE : CATALOG_INTRO_NEVER_FILES}
            {flags.catalogValueRank()
              ? ' Listings with no proof required, a higher listed payout, and a sooner deadline appear first when those facts are in the catalog.'
              : ''}
          </p>
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            These listings come from public sources, and we haven’t checked them against the official notices yet. Each one links to the official site, or to where we found it. Confirm the details there before you file.
          </p>

          <div className="mt-6">
            <HubLinks categories={categories} current="all" />
          </div>
        </div>
      </section>

      <section className="container-page py-8 sm:py-10">
        <Suspense
          fallback={
            <div className="h-[7.5rem] rounded-2xl border border-slate-200 bg-white shadow-card" />
          }
        >
          <LawsuitFilters categories={categories} fileForYouFilter={mayFile && fileForYouIds.size > 0} />
        </Suspense>

        <p className="mt-6 text-sm text-ink-muted" role="status" aria-live="polite">
          {catalog.error ? (
            'Settlements didn’t load.'
          ) : (
            <>
              {count === 0
                ? openingSoon
                  ? 'No opening-soon settlements found'
                  : 'No open settlements found'
                : paged.totalPages > 1
                  ? `Showing ${rangeStart}–${rangeEnd} of ${count} ${openingSoon ? 'opening-soon' : 'open'} ${count === 1 ? 'settlement' : 'settlements'}`
                  : `Showing ${count} ${openingSoon ? 'opening-soon' : 'open'} ${count === 1 ? 'settlement' : 'settlements'}`}
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
              {fileForYou ? (
                <>
                  {' '}with Easy submit
                </>
              ) : null}
              {openingSoon ? (
                <>
                  {' '}not yet open for claims on Lawsuit AI
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
              <Link href={filtered ? `/lawsuits?${catalogQueryString({ q, category, hasDeadline, proof, fileForYou, openingSoon })}` : '/lawsuits'} className="btn-secondary mt-6">
                Try again
              </Link>
            }
          />
        ) : count === 0 ? (
          <EmptyState
            icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
            title={
              filtered
                ? openingSoon
                  ? 'No opening-soon settlements match your search'
                  : 'No open settlements match your search'
                : 'No open settlements to show right now'
            }
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
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {paged.items.map((l) => (
                <li key={l.id}>
                  <LawsuitCard lawsuit={l} fileForYou={fileForYouIds.has(l.id)} />
                </li>
              ))}
            </ul>
            <CatalogPagination
              page={paged.page}
              totalPages={paged.totalPages}
              prevHref={prevHref}
              nextHref={nextHref}
            />
            {openingSoonPreview.length > 0 && (
              <section className="mt-12 border-t border-slate-200 pt-8" aria-labelledby="opening-soon-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 id="opening-soon-heading" className="text-xl font-bold">
                      Opening soon
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      These listings are not taking claims on Lawsuit AI yet.
                    </p>
                  </div>
                  <Link href="/lawsuits?openingSoon=1" className="btn-secondary shrink-0">
                    See all opening soon
                  </Link>
                </div>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {openingSoonPreview.map((l) => (
                    <li key={l.id}>
                      <LawsuitCard lawsuit={l} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="mt-8 max-w-3xl">
              <AccountMatchBanner />
            </div>
          </>
        )}

        {showsSettleSignal && (
          <p className="mt-10 text-xs text-ink-muted">
            Listings from SettleSignal are adapted from{' '}
            <a
              href="https://settlesignal.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              SettleSignal (settlesignal.com)
            </a>{' '}
            under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              CC BY 4.0
            </a>
            . Lawsuit AI may have shortened or reformatted them.
          </p>
        )}
      </section>
    </>
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
    <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{body}</p>
      {action}
    </div>
  );
}
