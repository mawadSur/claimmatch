import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { flags } from '@/lib/flags';
import { lookupPublishedLawsuits, officialLinkFor } from '@/lib/lawsuits';
import {
  CLOSED_ARCHIVE_LABEL,
  RECENTLY_CLOSED_PATH,
  recentlyClosed,
} from '@/lib/recently-closed';
import { pageUrl } from '@/lib/settlement-seo';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import { formatDeadline } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TITLE = 'Recently closed settlements';
const DESCRIPTION =
  'Settlements that closed or passed their listed deadline in the last 90 days. Do not file unless the official site still accepts claims.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: pageUrl(RECENTLY_CLOSED_PATH) },
  robots: { index: false, follow: false },
};

export default async function RecentlyClosedPage() {
  if (!flags.closedArchive()) notFound();

  const catalog = await lookupPublishedLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const rows = recentlyClosed(catalog.lawsuits);

  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-page py-16 sm:py-20">
        <PageBreadcrumbs
          items={[
            { name: 'Home', href: '/' },
            { name: 'Open settlements', href: '/lawsuits' },
            { name: TITLE },
          ]}
        />
        <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">{TITLE}</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">{DESCRIPTION}</p>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {CLOSED_ARCHIVE_LABEL}
        </p>

        {rows.length === 0 ? (
          <p className="mt-10 text-ink-muted">
            Nothing in the catalog closed in the last 90 days.
          </p>
        ) : (
          <ul className="mt-10 space-y-4">
            {rows.map((lawsuit) => {
              const official = officialLinkFor(lawsuit);
              return (
                <li
                  key={lawsuit.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {CLOSED_ARCHIVE_LABEL}
                  </p>
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
                  {official ? (
                    <a
                      href={official.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
                    >
                      {official.kind === 'official'
                        ? `Official site (${official.host})`
                        : `${official.label} (${official.host})`}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">
                      We don&apos;t have the official link for this listing.
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
