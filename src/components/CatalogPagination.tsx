import Link from 'next/link';
import { pageUrl } from '@/lib/settlement-seo';

export function CatalogPagination({
  page,
  totalPages,
  prevHref,
  nextHref,
}: {
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  if (totalPages <= 1) return null;
  return (
    <>
      {prevHref ? <link rel="prev" href={pageUrl(prevHref)} /> : null}
      {nextHref ? <link rel="next" href={pageUrl(nextHref)} /> : null}
      <nav className="mt-10 flex flex-wrap items-center justify-center gap-3" aria-label="Pagination">
        {prevHref ? (
          <Link href={prevHref} className="btn-secondary">
            Previous
          </Link>
        ) : (
          <span className="btn-secondary pointer-events-none opacity-50">Previous</span>
        )}
        <p className="text-sm text-ink-muted">
          Page {page} of {totalPages}
        </p>
        {nextHref ? (
          <Link href={nextHref} className="btn-secondary">
            Next
          </Link>
        ) : (
          <span className="btn-secondary pointer-events-none opacity-50">Next</span>
        )}
      </nav>
    </>
  );
}
