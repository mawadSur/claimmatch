import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search, HelpCircle, CheckCircle2, XCircle, BadgeCheck } from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { jsonLd } from '@/lib/jsonld';
import { SITE } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ClaimMatch is free. We never take a cut of your settlement, and you never pay us to file on the official settlement site.',
  openGraph: {
    title: 'ClaimMatch pricing: free',
    description: 'Free. We never take a cut of your settlement.',
    url: `${SITE.url}/pricing`,
    siteName: SITE.name,
    type: 'website',
  },
};

const FREE = [
  'Browsing settlements that are open for claims',
  'Your ClaimMatch account',
  'Keeping track of the claims you file',
];

const NEVER = [
  'Take a share of any settlement payment',
  'Handle your settlement money',
  'Charge you to file a claim',
];

const FAQ = [
  {
    q: 'Does ClaimMatch cost anything?',
    a: 'No. ClaimMatch is free to use. We don’t charge you to browse settlements, create an account or keep track of your claims.',
  },
  {
    q: 'Do you take a cut of my settlement?',
    a: 'No. We never take a share of any settlement payment. If your claim is paid, the settlement administrator pays you directly, and ClaimMatch never handles that money.',
  },
  {
    q: 'Do I have to pay to file a claim?',
    a: 'No. You file on the official settlement website, and you should never have to pay to file a settlement claim. If someone asks you for a fee to get settlement money, be careful.',
  },
  {
    q: 'How does ClaimMatch make money?',
    a: 'Right now, it doesn’t. We don’t run ads, sell paid plans or sell your personal information. If we ever add a paid option, we will tell you before anything changes, you won’t be charged unless you choose it, and we will never take a cut of your settlement.',
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Pricing
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Free. <span className="text-brand-600">We never take a cut of your settlement.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch is a free claim assistant. You file on the official settlement
              site, and if your claim is paid, the money goes straight to you.
            </p>
          </div>
        </div>
      </section>

      {/* What's free / what we never do ------------------------------------- */}
      <section className="container-page pb-4">
        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 className="text-lg font-bold">Free for you</h2>
            <ul className="mt-4 space-y-3">
              {FREE.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 className="text-lg font-bold">What we never do</h2>
            <ul className="mt-4 space-y-3">
              {NEVER.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ ----------------------------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="pricing-faq">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-faq" className="text-3xl font-extrabold">Questions about cost</h2>
        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <h3 className="flex items-start gap-2 text-base font-bold">
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                {f.q}
              </h3>
              <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">{f.a}</p>
            </div>
          ))}
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
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

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-extrabold">See what’s open now</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Browse settlements that are open for claims, or create a free account to
            keep track of the claims you file.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
            <Link href="/signup" className="btn-secondary w-full sm:w-auto">
              Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
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
