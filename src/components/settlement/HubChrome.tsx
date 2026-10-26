import { AlertTriangle } from 'lucide-react';
import { LawsuitCard } from '@/components/LawsuitCard';
import { HubLinks } from '@/components/settlement/HubLinks';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import type { Lawsuit } from '@/lib/types';

export function HubChrome({
  title,
  lede,
  current,
  categories,
  lawsuits,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  lede: string;
  current: 'all' | 'closing-soon' | 'new' | string;
  categories: string[];
  lawsuits: Lawsuit[];
  emptyTitle: string;
  emptyBody: string;
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
          <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">{lede}</p>
          <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="text-sm text-amber-900">
              <p className="font-bold">Unverified: check the official site</p>
              <p className="mt-1">
                These listings come from public sources, and we haven’t checked them
                against the official notices yet. Confirm the deadline, who qualifies and
                what proof you need on the official site before you file.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <HubLinks categories={categories} current={current} />
          </div>
        </div>
      </section>

      <section className="container-page py-10">
        <p className="text-sm text-ink-muted" role="status">
          {lawsuits.length === 0
            ? 'No open settlements in this list right now.'
            : `Showing ${lawsuits.length} open ${lawsuits.length === 1 ? 'settlement' : 'settlements'}`}
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
      </section>
    </>
  );
}
