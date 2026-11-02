import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Entry into the logged-out match preview. Render only when the flag is on. */
export function MatchPreviewEntry({
  variant = 'button',
}: {
  variant?: 'button' | 'hero' | 'banner';
}) {
  if (variant === 'banner') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-semibold text-brand-700">No account needed</p>
          <p className="mt-1 text-lg font-semibold text-ink">See matching open settlements</p>
          <p className="mt-1 text-sm text-ink-muted">
            Answer a few questions about your state, products, services, and
            data-breach notices. Then we&rsquo;ll list open settlements using
            the same matcher.
          </p>
        </div>
        <Link href="/preview" className="btn-primary mt-4 shrink-0 sm:mt-0">
          See matching settlements <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/preview"
      className={variant === 'hero' ? 'btn-secondary px-6 text-base' : 'btn-secondary'}
    >
      See matching settlements <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
