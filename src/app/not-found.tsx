import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass, Home, Search, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The page you’re looking for doesn’t exist. Head back home or browse open settlements on ClaimMatch.',
};

export default function NotFound() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-brand-100/50 blur-3xl" />
      <div className="container-narrow relative flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-card">
          <Compass className="h-7 w-7" />
        </div>

        <p className="mt-8 font-display text-6xl font-extrabold text-brand-200 sm:text-7xl">
          404
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          This page went unclaimed.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-ink-muted">
          We couldn’t find the page you’re looking for — but there’s still money out
          there to find. Let’s get you back on track.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn-primary w-full sm:w-auto">
            <Home className="h-4 w-4" /> Back home
          </Link>
          <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
            <Search className="h-4 w-4" /> Browse settlements
          </Link>
        </div>

        <Link
          href="/how-it-works"
          className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          See how ClaimMatch works <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
