import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatCount } from '@/lib/home-stats';

/** Closing call to action: the one navy panel on the page. */
export function HomeFinalCta({
  primary,
  secondary,
  openCount,
  costLine,
}: {
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  openCount: number | null;
  costLine: string;
}) {
  return (
    <section aria-labelledby="final-cta-heading" className="bg-brand-50 pt-20 sm:pt-24">
      <div className="container-page">
        <div
          data-reveal="scale"
          className="relative isolate overflow-hidden rounded-4xl bg-brand-900 px-6 py-16 text-center shadow-device sm:px-12 sm:py-20"
        >
          <div aria-hidden className="absolute inset-0 -z-10 bg-grid-dark" />
          <div
            aria-hidden
            className="absolute left-1/2 top-0 -z-10 h-80 w-[48rem] max-w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/30 blur-3xl"
          />
          <h2
            id="final-cta-heading"
            className="mx-auto max-w-2xl text-4xl font-medium leading-[1.08] text-white sm:text-5xl"
          >
            See what’s open <span className="italic text-gold-300">before the deadlines pass.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-brand-100">
            {openCount ? `${formatCount(openCount)} settlements are taking claims right now. ` : ''}
            {costLine}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={primary.href} className="btn-on-dark px-6">
              {primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={secondary.href}
              className="btn px-6 text-white ring-1 ring-inset ring-white/25 hover:bg-white/10 focus-visible:ring-offset-brand-900"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
