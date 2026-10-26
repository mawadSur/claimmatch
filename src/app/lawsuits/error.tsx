'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

/**
 * Shown when a catalog page cannot load its data. Never falls back to sample
 * settlements: people get an honest error and a way to retry.
 */
export default function LawsuitsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="container-narrow py-20 text-center">
      <div
        className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700"
        aria-hidden="true"
      >
        <RefreshCw className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">We couldn’t load this page</h1>
      <p className="mx-auto mt-2 max-w-md text-ink-muted">
        This is on our side, not yours. Please try again in a minute.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back home
        </Link>
      </div>
    </section>
  );
}
