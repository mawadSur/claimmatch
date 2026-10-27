import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Search } from 'lucide-react';
import { flags } from '@/lib/flags';
import { cleanSearchTerm, lookupPublishedLawsuits, officialLinkFor } from '@/lib/lawsuits';
import { NOTICE_LOOKUP_PROMPT, NOTICE_NOT_FOUND, rankNoticeMatches } from '@/lib/notice-lookup';
import { VerifiedBadge } from '@/components/settlement/VerifiedBadge';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import { formatDeadline } from '@/lib/utils';
import { pageUrl } from '@/lib/settlement-seo';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const q = cleanSearchTerm(firstParam((await searchParams).q));
  return {
    title: 'Check a settlement notice',
    description:
      'Paste a settlement name, administrator, or claim ID from a notice. We show catalog matches and the official link when we have one.',
    alternates: { canonical: pageUrl('/check') },
    robots: q ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function CheckNoticePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!flags.noticeLookup()) notFound();

  const q = cleanSearchTerm(firstParam((await searchParams).q));
  const catalog = q ? await lookupPublishedLawsuits() : { lawsuits: [], error: false };
  const matches = q && !catalog.error ? rankNoticeMatches(q, catalog.lawsuits) : [];
  const notFoundMessage = q && !catalog.error && matches.length === 0 ? NOTICE_NOT_FOUND : null;

  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-narrow py-16 sm:py-20">
        <PageBreadcrumbs
          items={[
            { name: 'Home', href: '/' },
            { name: 'Check a notice' },
          ]}
        />
        <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
          Check a settlement notice
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          Paste the settlement name, administrator, or a claim or notice ID from
          the letter or email you received. We look it up in our catalog. We do
          not say whether a notice is real or fake.
        </p>

        <form method="get" action="/check" className="mt-8">
          <label htmlFor="notice-q" className="text-sm font-semibold text-ink">
            {NOTICE_LOOKUP_PROMPT}
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="notice-q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              maxLength={100}
              className="field-input"
              placeholder="Amazon Return Policy, Angeion, or a claim ID"
            />
            <button type="submit" className="btn-primary sm:w-auto">
              <Search className="h-4 w-4" aria-hidden="true" /> Search catalog
            </button>
          </div>
        </form>

        {catalog.error && (
          <p role="alert" className="mt-8 rounded-xl border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700">
            We couldn&apos;t search the catalog right now. Try again in a moment.
          </p>
        )}

        {notFoundMessage && (
          <p role="status" className="mt-8 rounded-xl border border-gray-200 bg-white p-5 text-ink">
            {notFoundMessage}
          </p>
        )}

        {matches.length > 0 && (
          <ul className="mt-8 space-y-4">
            {matches.map((lawsuit) => {
              const official = officialLinkFor(lawsuit);
              return (
                <li
                  key={lawsuit.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <VerifiedBadge lawsuit={lawsuit} />
                  </div>
                  <h2 className="mt-2 text-lg font-bold">
                    <Link
                      href={`/lawsuits/${lawsuit.slug}`}
                      className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {lawsuit.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted">
                    {lawsuit.deadline
                      ? `Listed deadline: ${formatDeadline(lawsuit.deadline)}`
                      : 'No deadline listed'}
                  </p>
                  {official?.kind === 'official' ? (
                    <a
                      href={official.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
                    >
                      Official site ({official.host})
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">
                      We don&apos;t have the official claim link for this listing yet.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
