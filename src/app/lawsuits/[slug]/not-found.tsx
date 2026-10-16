import Link from 'next/link';
import { Home, Search } from 'lucide-react';

/**
 * A settlement page that doesn't exist, isn't listed or was one of the
 * fictional listings (still a 404; the page's generateMetadata sets the title
 * and noindex). Old match and digest emails linked
 * fictional listings as "View & file your claim", so people arriving from one
 * are told plainly that there is nothing to file (D42).
 */
export default function SettlementNotFound() {
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-5xl font-extrabold text-brand-200" aria-hidden>
          404
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">We couldn’t find this settlement</h1>
        <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink-muted">
          It may have closed, or the link may be wrong. Some listings were removed
          because they were test data, not real settlements. If an email from us sent
          you here, there is nothing to file.
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
            <Search className="h-4 w-4" aria-hidden /> Browse open settlements
          </Link>
          <Link href="/" className="btn-secondary w-full sm:w-auto">
            <Home className="h-4 w-4" aria-hidden /> Back home
          </Link>
        </div>
      </div>
    </section>
  );
}
