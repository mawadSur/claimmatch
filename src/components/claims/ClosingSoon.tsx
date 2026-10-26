import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, ExternalLink } from 'lucide-react';
import { UnverifiedLabel } from './UnverifiedLabel';
import type { ClosingSoonItem } from './dashboard-model';

/**
 * A catalog module (D50 interim): open settlements in the list with the
 * nearest deadlines. Not a match list and not personalized. Server-safe.
 */
export function ClosingSoon({ items, failed = false }: { items: ClosingSoonItem[]; failed?: boolean }) {
  return (
    <section aria-labelledby="closing-soon-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="closing-soon-title" className="text-2xl font-extrabold">
            Closing soon
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Open settlements in our list with the nearest deadlines. This is not a
            list of matches: read each official notice to see if it applies to you.
          </p>
        </div>
        <Link href="/lawsuits" className="btn-secondary !py-2 text-sm">
          Browse all settlements
        </Link>
      </div>

      {failed ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-2xl border border-danger-50 bg-white p-5 text-sm shadow-card"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
          <p className="text-ink-muted">
            <span className="font-semibold text-ink">We couldn&rsquo;t load settlements right now.</span>{' '}
            Please try again in a minute, or{' '}
            <Link href="/lawsuits" className="font-semibold text-brand-700 underline underline-offset-2">
              go to all settlements
            </Link>
            .
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-ink-muted">
          No deadlines are coming up in our list right now.{' '}
          <Link href="/lawsuits" className="font-semibold text-brand-700 underline underline-offset-2">
            Browse all open settlements
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <Link
                  href={`/claim/${item.slug}`}
                  className="rounded font-semibold text-ink hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {item.title}
                </Link>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
                  <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  {item.deadlineText}
                </p>
                <UnverifiedLabel className="mt-2" />
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {item.officialUrl && (
                  <a
                    href={item.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label={`Official site for ${item.title} (opens in a new tab)`}
                  >
                    Official site <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                )}
                <Link
                  href={`/claim/${item.slug}`}
                  className="btn-secondary !px-4 !py-2 text-sm"
                  aria-label={`How to file: ${item.title}`}
                >
                  How to file <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
