import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import {
  OFFICIAL_FILING_IS_FREE, feeEveryClaimCopy, publicBetaFeeCopy, whoFilesAnswer,
} from '@/lib/copy';
import { flags } from '@/lib/flags';

/** `mayFile` follows the fee disclosure and one-click filing, so the answers never contradict each other. */
export function homeFaqItems(
  disclose = flags.feeDisclosure(),
  mayFile = disclose || flags.oneClickFiling(),
) {
  return [
    {
      q: 'Is Lawsuit AI free?',
      a: disclose
        ? feeEveryClaimCopy()
        : `${publicBetaFeeCopy()} ${OFFICIAL_FILING_IS_FREE}`,
    },
    {
      q: 'Do you file claims for me?',
      a: whoFilesAnswer(mayFile),
    },
    {
      q: 'Do you handle settlement payments?',
      a: 'No. We never handle settlement payments. If a claim is paid, the settlement administrator pays you directly.',
    },
    {
      q: 'How does Lawsuit AI make money?',
      a: disclose
        ? feeEveryClaimCopy()
        : `${publicBetaFeeCopy()} We don’t run ads or sell paid plans today, and we do not sell your personal information.`,
    },
    {
      q: 'Are these listings verified?',
      a: 'Most listings come from public sources and we have not checked them yet. Always confirm the deadline, who qualifies, and how to file on the official settlement site.',
    },
  ];
}

export function HomeFaq() {
  const items = homeFaqItems();
  return (
    <section className="section-y bg-white" aria-labelledby="home-faq-heading">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div data-reveal>
          <p className="eyebrow">Questions</p>
          <h2 id="home-faq-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            Straight answers
          </h2>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-ink-muted">
            The things people ask before they trust a settlement site.
          </p>
          <div className="mt-6 flex flex-col items-start gap-1 text-sm">
            <Link href="/faq" className="text-link inline-flex min-h-tap items-center gap-1">
              See all questions <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/trust" className="text-link inline-flex min-h-tap items-center gap-1">
              More on how Lawsuit AI works <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold text-ink transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-slate-200 transition-transform duration-300 group-open:rotate-180">
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </span>
              </summary>
              <p className="-mt-1 max-w-2xl pb-6 text-base leading-relaxed text-ink-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
      {/* FAQPage JSON-LD lives on /faq only, so the same Q&As are marked up once site-wide. */}
    </section>
  );
}
