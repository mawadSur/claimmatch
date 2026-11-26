import { CatalogPagination } from '@/components/CatalogPagination';
import { LawsuitCard } from '@/components/LawsuitCard';
import { HubLinks } from '@/components/settlement/HubLinks';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import { RelatedSettlements } from '@/components/settlement/RelatedSettlements';
import { LAWSUITS_PAGE_SIZE } from '@/lib/catalog-page';
import type { RelatedSettlement } from '@/lib/related-settlements';
import type { Lawsuit } from '@/lib/types';

export function HubChrome({
  title,
  lede,
  current,
  categories,
  lawsuits,
  emptyTitle,
  emptyBody,
  related,
  relatedFromSlug,
  pagination,
}: {
  title: string;
  lede: string;
  current: 'all' | 'closing-soon' | 'closing-this-month' | 'no-proof' | 'new' | string;
  categories: string[];
  lawsuits: Lawsuit[];
  emptyTitle: string;
  emptyBody: string;
  related?: RelatedSettlement[];
  relatedFromSlug?: string;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    prevHref: string | null;
    nextHref: string | null;
  };
}) {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-12 sm:py-16">
          <PageBreadcrumbs
            items={[
              { name: 'Home', href: '/' },
              { name: 'Open settlements', href: '/lawsuits' },
              { name: title },
            ]}
          />
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">{lede}</p>
          <div className="mt-6">
            <HubLinks categories={categories} current={current} />
          </div>
        </div>
      </section>

      <section className="container-page py-10">
        <p className="text-sm text-ink-muted" role="status">
          {hubCountLabel(lawsuits.length, pagination)}
        </p>
        {lawsuits.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
            <h2 className="text-lg font-bold">{emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{emptyBody}</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lawsuits.map((lawsuit) => (
              <li key={lawsuit.id}>
                <LawsuitCard lawsuit={lawsuit} />
              </li>
            ))}
          </ul>
        )}
        {pagination ? (
          <CatalogPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            prevHref={pagination.prevHref}
            nextHref={pagination.nextHref}
          />
        ) : null}
        {related && related.length > 0 && relatedFromSlug && (
          <RelatedSettlements items={related} fromSlug={relatedFromSlug} />
        )}
      </section>
    </>
  );
}

function hubCountLabel(
  shown: number,
  pagination?: { page: number; totalPages: number; total: number },
): string {
  if (shown === 0) return 'No open settlements in this list right now.';
  if (!pagination || pagination.totalPages <= 1) {
    return `Showing ${shown} open ${shown === 1 ? 'settlement' : 'settlements'}`;
  }
  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * LAWSUITS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(pagination.page * LAWSUITS_PAGE_SIZE, pagination.total);
  return `Showing ${rangeStart}–${rangeEnd} of ${pagination.total} open ${pagination.total === 1 ? 'settlement' : 'settlements'}`;
}
