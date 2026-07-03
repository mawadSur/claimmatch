import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Sparkles, SearchX } from 'lucide-react';
import { getLawsuits, getCategories } from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import { LawsuitFilters } from '@/components/LawsuitFilters';

export const metadata: Metadata = { title: 'Browse settlements' };

export default async function LawsuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const [lawsuits, categories] = await Promise.all([
    getLawsuits({ q, category }),
    getCategories(),
  ]);

  const count = lawsuits.length;
  const filtered = Boolean(q || category);

  return (
    <>
      {/* Header ------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-14 sm:py-16">
          <span className="badge-brand gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Updated continuously
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            Browse open settlements
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            Every open class-action settlement we track, in one place. Search by
            keyword or filter by category to find the ones worth your time — then
            file your claim in minutes.
          </p>
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

        <p className="mt-6 text-sm text-ink-muted">
          {count === 0
            ? 'No settlements found'
            : `Showing ${count} ${count === 1 ? 'settlement' : 'settlements'}`}
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
        </p>

        {count === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <SearchX className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold">
              No settlements match your filters
            </h2>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              Try a different keyword or clear your filters to see every open
              settlement. New cases are added all the time.
            </p>
            {filtered && (
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lawsuits.map((l) => (
              <LawsuitCard key={l.id} lawsuit={l} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
