import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass, Home, Search, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'We couldn’t find that page. Go back home or browse settlements that are open for claims.',
};

export default function NotFound() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow relative flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-card">
          <Compass className="h-7 w-7" aria-hidden />
        </div>

        <p className="mt-8 font-display text-6xl font-extrabold text-brand-200 sm:text-7xl" aria-hidden>
          404
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          We couldn’t find that page
        </h1>
        <p className="mx-auto mt-4 max-w-md text-ink-muted">
          The link may be wrong, or the page may have moved. If you were looking
          for a settlement, it may have closed or been taken down.
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
            <Search className="h-4 w-4" aria-hidden /> Browse open settlements
          </Link>
          <Link href="/" className="btn-secondary w-full sm:w-auto">
            <Home className="h-4 w-4" aria-hidden /> Back home
          </Link>
        </div>

        <Link
          href="/how-it-works"
          className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          See how ClaimMatch works <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
