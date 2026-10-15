import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Sparkles, CheckCircle2, Search, ShieldCheck,
  HelpCircle, Scale,
} from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { SITE, canonicalUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ClaimMatch is free to check and free during beta. Filing a settlement claim is always free on the official administrator site.',
  alternates: { canonical: canonicalUrl('/pricing') },
  openGraph: {
    title: 'ClaimMatch Pricing — Free during beta',
    description:
      'Free to check. You submit on the official site. Our fee is being finalized.',
    url: canonicalUrl('/pricing'),
    siteName: SITE.name,
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Can I file myself?',
    a: 'Yes, free. Every settlement we surface links to the official court or administrator page. You never need ClaimMatch to file, and filing on the official site does not cost a fee to us.',
  },
  {
    q: 'What does ClaimMatch cost right now?',
    a: 'Using ClaimMatch is free during beta. Our fee is being finalized. If we ever add a fee or paid features, we will show the price before you use them.',
  },
  {
    q: 'When would I ever be charged?',
    a: 'Not during beta, and never without a price shown first. Filing on the official administrator site stays free regardless.',
  },
  {
    q: 'Are there hidden or upfront fees?',
    a: 'No subscription and no setup fee. Checking your matches and pre-filling a packet does not require a card.',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Pricing
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Free to check.{' '}
              <span className="text-brand-600">Free during beta.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Filing a settlement claim is always free on the official
              administrator’s site. ClaimMatch pre-fills your details so you can
              submit faster.
            </p>
            <div className="mx-auto mt-8 max-w-xl text-left">
              <FeeDisclosure />
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Check for free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/how-it-works" className="btn-secondary w-full sm:w-auto">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <HowWeMakeMoney />
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> Pricing FAQ
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">Common questions</h2>
        </div>
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <h3 className="flex items-start gap-2 text-base font-bold">
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                {f.q}
              </h3>
              <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">{f.a}</p>
            </div>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            }),
          }}
        />
      </section>

      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="container-page text-center">
          <div className="mx-auto inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand-600" /> You can always file yourself
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            The official administrator site is always free. ClaimMatch is optional.
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">See what you may qualify for</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Free to check. You submit on the official site.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get matched free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
              <Search className="h-4 w-4" /> Browse settlements
            </Link>
          </div>
          <div className="mt-10">
            <TrustBadges />
          </div>
          <div className="mx-auto mt-10 max-w-2xl text-left">
            <Disclaimer />
          </div>
        </div>
      </section>
    </>
  );
}
