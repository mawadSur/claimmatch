import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ExternalLink, HandCoins, Scale } from 'lucide-react';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import {
  NO_SSN_OR_BANK_TO_MATCH,
  OPERATOR_LEGAL_NAME,
  filingFact,
  operatorLine,
} from '@/lib/copy';

/**
 * Short trust section. Every line must stay literally true of the product today.
 * Kept as a server component so fee/filing flags stay server-resolved.
 */
const OTHER_FACTS = [
  {
    icon: Building2,
    title: 'Who we are',
    body: `${operatorLine(OPERATOR_LEGAL_NAME)} Lawsuit AI is a claim assistant, not a law firm, and does not give legal advice.`,
  },
  {
    icon: HandCoins,
    title: 'We never touch your payout',
    body: 'If a claim is paid, the settlement administrator pays you directly. The money never passes through Lawsuit AI.',
  },
  {
    icon: Scale,
    title: 'Matching stays private',
    body: NO_SSN_OR_BANK_TO_MATCH,
  },
] as const;

export function HomeTrust() {
  const FACTS = [{ icon: ExternalLink, ...filingFact() }, ...OTHER_FACTS];
  return (
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
              {FACTS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} data-reveal style={{ '--reveal-at': (i % 2) * 8 } as CSSProperties}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
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

          <div data-reveal="scale" className="lg:pt-1">
            <HowWeMakeMoney />
          </div>
        </div>
      </div>
    </section>
  );
}
