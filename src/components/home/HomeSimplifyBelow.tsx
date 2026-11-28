'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, ChevronDown, ExternalLink, HandCoins, Scale } from 'lucide-react';
import { JsonLd } from '@/components/settlement/JsonLd';
import { HomeFinalCta } from './HomeFinalCta';

type TrustIcon = 'file' | 'who' | 'payout' | 'private';

const ICONS: Record<TrustIcon, typeof Building2> = {
  file: ExternalLink,
  who: Building2,
  payout: HandCoins,
  private: Scale,
};

/**
 * Below-the-fold trust + FAQ + final CTA as one client island. Fee/filing copy is
 * resolved on the server and passed in as plain strings.
 */
export function HomeSimplifyBelow({
  trustFacts,
  moneyPoints,
  faqItems,
  faqLd,
  finalCta,
}: {
  trustFacts: ReadonlyArray<{ title: string; body: string; icon: TrustIcon }>;
  moneyPoints: readonly string[];
  faqItems: ReadonlyArray<{ q: string; a: string }>;
  faqLd: unknown;
  finalCta: {
    primary: { href: string; label: string };
    secondary: { href: string; label: string };
    openCount: number | null;
    costLine: string;
  };
}) {
  return (
    <>
      <section aria-labelledby="trust-heading" className="section-y bg-brand-50">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div data-reveal>
                <p className="eyebrow">Why you can trust it</p>
                <h2 id="trust-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                  Checkable facts, not marketing
                </h2>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
                  Every claim goes through the official settlement site. Every listing shows its source.
                </p>
              </div>

              <ul className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
                {trustFacts.map(({ title, body, icon }, i) => {
                  const Icon = ICONS[icon];
                  return (
                    <li
                      key={title}
                      data-reveal
                      style={{ ['--reveal-at' as string]: (i % 2) * 8 }}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                <Link href="/trust" className="text-link inline-flex min-h-tap items-center gap-1">
                  Is Lawsuit AI legit? <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/privacy" className="text-link inline-flex min-h-tap items-center">
                  Privacy policy
                </Link>
              </div>
            </div>

            <aside
              data-reveal="scale"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8 lg:pt-1"
              aria-labelledby="home-money-heading"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <HandCoins className="h-5 w-5" aria-hidden />
                </div>
                <h2 id="home-money-heading" className="text-2xl font-bold">
                  How Lawsuit AI makes money
                </h2>
              </div>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-muted">
                {moneyPoints.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm">
                <Link href="/how-we-make-money" className="text-link inline-flex min-h-tap items-center gap-1">
                  Full details <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="section-y bg-white" aria-labelledby="home-faq-heading">
        <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div data-reveal>
            <p className="eyebrow">Questions</p>
            <h2 id="home-faq-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
              Straight answers
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-muted sm:text-lg">
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
            {faqItems.map((item) => (
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
        <JsonLd data={faqLd} />
      </section>

      <HomeFinalCta {...finalCta} />
    </>
  );
}
