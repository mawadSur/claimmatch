import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Sparkles, HandCoins, CheckCircle2, Search, ShieldCheck,
  Wallet, FileSignature, TrendingUp, HelpCircle, XCircle, Scale,
} from 'lucide-react';
import { FEE_PCT, feeAmount, netAmount, formatUSD } from '@/lib/recovery';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { SITE } from '@/lib/utils';

const PCT = Math.round(FEE_PCT * 100);

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    `ClaimMatch is free to check and free to get matched. We only earn a ${PCT}% contingency fee — a percentage of what you recover — when you actually get paid. No win, no fee.`,
  openGraph: {
    title: `ClaimMatch Pricing — ${PCT}% Only When You Get Paid`,
    description:
      `Free to check, free to file. We only take a ${PCT}% fee when you actually recover money. No upfront costs, no win no fee.`,
    url: `${SITE.url}/pricing`,
    siteName: SITE.name,
    type: 'website',
  },
};

// Worked examples: gross recovered -> our fee -> what you keep.
const EXAMPLES = [50, 400, 1200];

const STEPS = [
  {
    icon: Search,
    title: 'Check for free',
    body: 'Build a 2-minute eligibility profile and see every settlement you may qualify for. No card, no commitment, no charge — ever.',
    tag: '$0',
  },
  {
    icon: FileSignature,
    title: 'We file on your behalf',
    body: 'Authorize with a single e-signature and we prepare and submit your claims to the official administrators. Still nothing to pay.',
    tag: '$0',
  },
  {
    icon: TrendingUp,
    title: 'You get paid, we take our fee',
    body: `When a settlement actually pays out, we forward you the money and keep a ${PCT}% contingency fee. If you never get paid, you never owe us a cent.`,
    tag: `${PCT}%`,
  },
];

const FAQ = [
  {
    q: 'When exactly am I charged?',
    a: `Only after a settlement administrator pays out on a claim we filed for you. At that point we forward you the money you're owed and keep our ${PCT}% contingency fee. Nothing is charged when you sign up, get matched, or file.`,
  },
  {
    q: 'What if I get nothing?',
    a: 'Then you owe nothing. Our fee is a percentage of money you actually recover, so if a claim is denied or pays out $0, there is no fee. That is what "no win, no fee" means — the risk is on us, not you.',
  },
  {
    q: 'Can I just file the claims myself?',
    a: 'Absolutely. Every settlement we surface links to the official court or administrator page, and you are always free to file directly with them for free. You pay us a fee only when you choose to have us handle the filing and it results in a payout.',
  },
  {
    q: 'Are there any hidden or upfront fees?',
    a: `None. There is no subscription, no per-claim charge, and no setup fee. The only money that ever changes hands is our ${PCT}% share of a real recovery — and you can cancel anytime before a claim is filed.`,
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Pricing
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Free to check.{' '}
              <span className="text-brand-600">We only get paid when you do.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Checking your matches and getting matched is completely free. We
              recover your settlement money for you and take a simple{' '}
              <strong className="font-semibold text-ink">{PCT}%</strong> of what you
              actually receive — never a dollar upfront.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Check for free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/how-it-works" className="btn-secondary w-full sm:w-auto">
                How it works
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-soft">
              No upfront cost · No subscription · No win, no fee
            </p>
          </div>
        </div>
      </section>

      {/* The one-number pricing card ----------------------------------------- */}
      <section className="container-page -mt-6 pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
            <div className="grid gap-0 sm:grid-cols-[1.1fr_1fr]">
              {/* Left: the headline number */}
              <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <HandCoins className="h-3.5 w-3.5" /> Contingency fee
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <span className="font-display text-6xl font-extrabold leading-none">
                    {PCT}%
                  </span>
                  <span className="pb-1 text-sm text-white/80">
                    of what you recover
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  That is the entire price. We only ever take a share of money you
                  actually get — so our incentive is simply to win you as much as
                  possible.
                </p>
              </div>

              {/* Right: what's included */}
              <div className="p-8 sm:p-10">
                <h2 className="text-lg font-bold">What&rsquo;s included</h2>
                <ul className="mt-4 space-y-3">
                  {[
                    'Unlimited settlement matching',
                    'We file every eligible claim for you',
                    'Alerts the moment new matches open',
                    'We chase the payout end to end',
                    'Cancel anytime before a claim is filed',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-ink-muted">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How the pricing works (3 steps) ------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">How the pricing works</h2>
          <p className="mt-3 text-ink-muted">
            You pay nothing until real money lands in your pocket. Here is exactly
            where a dollar does — and doesn&rsquo;t — change hands.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <s.icon className="h-5 w-5" />
                </div>
                <span
                  className={
                    i === 2
                      ? 'font-display text-2xl font-extrabold text-brand-600'
                      : 'font-display text-2xl font-extrabold text-success-500'
                  }
                >
                  {s.tag}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Worked example ------------------------------------------------------ */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> A worked example
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">Do the math with us</h2>
            <p className="mt-3 text-ink-muted">
              Say a settlement pays out {formatUSD(EXAMPLES[1])} on a claim we filed
              for you. We keep {formatUSD(feeAmount(EXAMPLES[1]))} ({PCT}%) and you
              keep {formatUSD(netAmount(EXAMPLES[1]))}. Here&rsquo;s how it scales:
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-3 font-semibold">You recover</th>
                  <th className="px-5 py-3 font-semibold">Our fee ({PCT}%)</th>
                  <th className="px-5 py-3 text-right font-semibold">You keep</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((gross) => (
                  <tr key={gross} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-4 font-semibold text-ink">
                      {formatUSD(gross)}
                    </td>
                    <td className="px-5 py-4 text-ink-muted">
                      &minus;{formatUSD(feeAmount(gross))}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-success-600">
                      {formatUSD(netAmount(gross))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-ink-soft">
            If a claim pays out {formatUSD(0)}, our fee is {formatUSD(0)}. You only
            ever share a slice of a real recovery.
          </p>
        </div>
      </section>

      {/* FAQ ----------------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> Pricing FAQ
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">Questions about the fee</h2>
        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {FAQ.map((f) => (
            <div
              key={f.q}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
            >
              <h3 className="flex items-start gap-2 text-base font-bold">
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                {f.q}
              </h3>
              <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">
                {f.a}
              </p>
            </div>
          ))}
        </div>

        {/* FAQ JSON-LD for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: f.a,
                },
              })),
            }),
          }}
        />
      </section>

      {/* Trust reinforcement ------------------------------------------------- */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Aligned with you,
              start to finish
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              No upfront charge means we win only when you win.
            </p>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3 text-sm text-ink-muted">
            <XCircle className="h-4 w-4 shrink-0 text-danger-500" />
            No setup fees, no subscriptions, no charge to browse or file.
          </div>
        </div>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">See what you&rsquo;re owed</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            It&rsquo;s free to check and free to file. You only pay our {PCT}% when
            you actually get paid.
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
