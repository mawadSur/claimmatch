import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search, HelpCircle, CheckCircle2, XCircle, BadgeCheck } from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { OFFICIAL_FILING_IS_FREE, feeEveryClaimCopy, filingFact, publicBetaFeeCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { jsonLd } from '@/lib/jsonld';
import { publicPageMetadata } from '@/lib/site-metadata';

export function generateMetadata(): Metadata {
  if (flags.feeDisclosure()) {
    return publicPageMetadata({
      title: 'Pricing',
      description: feeEveryClaimCopy(),
      path: '/pricing',
    });
  }
  return publicPageMetadata({
    title: 'Pricing',
    description: flags.oneClickFiling()
      ? `${publicBetaFeeCopy()} ${OFFICIAL_FILING_IS_FREE}`
      : `${publicBetaFeeCopy()} You file on the official settlement site.`,
    path: '/pricing',
  });
}

const FREE = [
  'Browsing settlements that are open for claims',
  'Your Lawsuit AI account',
  'Keeping track of the claims you file',
];

const NEVER = [
  'Handle your settlement money',
  'File a claim for you',
  'Charge you to file a claim',
];

function pricingFaq(disclose: boolean) {
  if (disclose) {
    const fee = feeEveryClaimCopy();
    return [
      {
        q: 'Does Lawsuit AI cost anything?',
        a: fee,
      },
      {
        q: 'Do you handle my settlement money?',
        a: 'No. We never handle settlement payments. If your claim is paid, the settlement administrator pays you directly.',
      },
      {
        q: 'Do I have to pay to file a claim?',
        a: `No. ${OFFICIAL_FILING_IS_FREE}`,
      },
      {
        q: 'How does Lawsuit AI make money?',
        a: `${fee} We don’t run ads or sell paid plans, and we do not sell your personal information.`,
      },
    ];
  }
  return [
    {
      q: 'Does Lawsuit AI cost anything?',
      a: `${publicBetaFeeCopy()} We don’t charge you to browse settlements, create an account or keep track of your claims.`,
    },
    {
      q: 'Do you handle my settlement money?',
      a: 'No. We never handle settlement payments. If your claim is paid, the settlement administrator pays you directly.',
    },
    {
      q: 'Do I have to pay to file a claim?',
      a: flags.oneClickFiling()
        ? `No. ${OFFICIAL_FILING_IS_FREE}`
        : `No. You file on the official settlement website. ${OFFICIAL_FILING_IS_FREE}`,
    },
    {
      q: 'How does Lawsuit AI make money?',
      a: `${publicBetaFeeCopy()} We don’t run ads or sell paid plans today, and we do not sell your personal information.`,
    },
  ];
}

export default function PricingPage() {
  const disclose = flags.feeDisclosure();
  const faq = pricingFaq(disclose);

  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="bg-brand-50">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Pricing
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              {disclose ? (
                <>
                  A share of what you receive.{' '}
                  <span className="text-brand-600">Official filing stays free.</span>
                </>
              ) : (
                <>
                  Free during beta.{' '}
                  <span className="text-brand-600">
                    {flags.panelTrustCopy()
                      ? 'Any future pricing will be shown before you use it.'
                      : 'We may introduce a fee later.'}
                  </span>
                </>
              )}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              {disclose
                ? `${feeEveryClaimCopy()} You can always file on the official settlement site yourself instead, where filing is free.`
                : flags.oneClickFiling()
                  ? `${publicBetaFeeCopy()} ${filingFact(true).body}`
                  : `${publicBetaFeeCopy()} You file on the official settlement site, and if your claim is paid, the money goes straight to you.`}
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
          {faq.map((f) => (
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
              mainEntity: faq.map((f) => ({
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
          <p className="mt-6 text-sm">
            <Link href="/faq" className="text-link inline-flex min-h-tap items-center gap-1">
              More questions? Read the FAQ <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>

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
