import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, FileSearch, HandCoins, Lock } from 'lucide-react';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { filingFact } from '@/lib/copy';

/**
 * Trust facts. Every line must stay literally true of the product today;
 * add one only when the product does it (same rule as TrustBadges).
 */
const OTHER_FACTS = [
  {
    icon: HandCoins,
    title: 'We never handle settlement payments',
    body: 'If a claim is paid, the settlement administrator pays you directly. The money never passes through Lawsuit AI.',
  },
  {
    icon: FileSearch,
    title: 'Every listing shows its source',
    body: 'Listings come from SettleSignal, a public data source, and link to the official notice. Until we check one, it is labeled unverified.',
  },
  {
    icon: Lock,
    title: 'Your details stay private',
    body: 'We don’t sell your personal information. What you save is there so you can copy it into official claim forms.',
  },
] as const;

export function HomeTrust() {
  // "Who files" follows the fee disclosure and one-click filing flags (copy.ts).
  const FACTS = [{ icon: ExternalLink, ...filingFact() }, ...OTHER_FACTS];
  return (
    <section aria-labelledby="trust-heading" className="section-y bg-brand-50">
      <div className="container-page">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <div data-reveal>
              <p className="eyebrow">Why you can trust it</p>
              <h2 id="trust-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                Built to be checked, not taken on faith
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
                Every claim goes through the official settlement site, and every listing
                shows where it came from. Here is exactly how Lawsuit AI works.
              </p>
            </div>

            <ul className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2">
              {FACTS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} data-reveal style={{ '--reveal-at': (i % 2) * 8 } as CSSProperties}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <Link href="/trust" className="text-link inline-flex min-h-tap items-center gap-1">
                Is Lawsuit AI legit? Read the facts <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/privacy" className="text-link inline-flex min-h-tap items-center">
                Privacy policy
              </Link>
            </div>
          </div>

          <div data-reveal="scale" className="lg:pt-1">
            <HowWeMakeMoney />
          </div>
        </div>
      </div>
    </section>
  );
}
