import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Sparkles, HandCoins, CheckCircle2, Search, ShieldCheck,
  Wallet, FileSignature, HelpCircle, XCircle, Scale, Handshake,
} from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ClaimMatch is free. We never charge you and never take a cut of your settlement — the administrator pays you directly. We earn referral fees from partner services you choose to use.',
};

const STEPS = [
  {
    icon: Search,
    title: 'Check for free',
    body: 'Build a 2-minute eligibility profile and see every settlement you may qualify for. No card, no commitment, no charge — ever.',
    tag: '$0',
  },
  {
    icon: FileSignature,
    title: 'Pre-fill and file yourself',
    body: 'We pre-fill the official claim form from your profile and link you straight to the administrator’s site, where you review and submit. Still nothing to pay.',
    tag: '$0',
  },
  {
    icon: HandCoins,
    title: 'The administrator pays you',
    body: 'When a settlement pays out, the money goes directly from the administrator to you. ClaimMatch never touches it and never takes a percentage.',
    tag: '$0',
  },
];

const FAQ = [
  {
    q: 'How is ClaimMatch free?',
    a: 'We make money from referral and lead fees paid by partner services — for example, when you choose to use a related product we recommend. Those partners pay us; you never do. Matching you to settlements and pre-filling your claims costs you nothing.',
  },
  {
    q: 'Do you take a percentage of what I recover?',
    a: 'Never. Settlement money is paid directly to you by the official administrator. ClaimMatch does not sit between you and your payout and does not take a cut of any recovery — you keep 100% of what you’re owed.',
  },
  {
    q: 'Do you file the claim for me?',
    a: 'No. We pre-fill the official claim form and deep-link you to the settlement administrator’s own site, where you review the details and submit the claim yourself. That keeps you in control and your money going straight to you.',
  },
  {
    q: 'Are there any hidden or upfront fees?',
    a: 'None. There is no subscription, no per-claim charge, and no setup fee. You are never asked for a card to check eligibility or to file. If anyone ever asks you to pay to claim a settlement, that is a red flag — and it is not us.',
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
              Free for you.{' '}
              <span className="text-brand-600">You keep 100% of what you recover.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch never charges you and never takes a cut of your
              settlement. We match you to claims and pre-fill the forms; the
              administrator pays you directly. We earn{' '}
              <strong className="font-semibold text-ink">referral fees</strong> from
              partner services you choose to use — never from your recovery.
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
              No upfront cost · No subscription · No cut of your recovery
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
                  <HandCoins className="h-3.5 w-3.5" /> What you pay
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <span className="font-display text-6xl font-extrabold leading-none">
                    $0
                  </span>
                  <span className="pb-1 text-sm text-white/80">
                    to you, always
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  That is the entire price. We never charge you and never skim a
                  percentage of your settlement — you keep every dollar the
                  administrator pays you.
                </p>
              </div>

              {/* Right: what's included */}
              <div className="p-8 sm:p-10">
                <h2 className="text-lg font-bold">What&rsquo;s included</h2>
                <ul className="mt-4 space-y-3">
                  {[
                    'Unlimited settlement matching',
                    'Pre-filled official claim forms',
                    'Alerts the moment new matches open',
                    'A tracker for every claim you file',
                    'You keep 100% of every recovery',
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
          <h2 className="text-3xl font-extrabold">Where a dollar changes hands</h2>
          <p className="mt-3 text-ink-muted">
            Spoiler: never between you and us. Here is exactly how the money
            flows.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-2xl font-extrabold text-success-500">
                  {s.tag}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How we actually make money ------------------------------------------ */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
            <div className="grid gap-0 sm:grid-cols-[1fr_1.1fr]">
              <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <Handshake className="h-3.5 w-3.5" /> How we stay free
                </div>
                <h2 className="mt-6 text-2xl font-extrabold">
                  Partners pay us — you never do.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  ClaimMatch earns referral and lead fees when you choose to use a
                  partner service we recommend. That keeps the settlement finder
                  free for everyone and our incentives pointed at helping you
                  actually get paid.
                </p>
              </div>
              <div className="p-8 sm:p-10">
                <h3 className="text-base font-bold">Our promise on money</h3>
                <ul className="mt-4 space-y-3">
                  {[
                    'We never charge you to find or file a claim',
                    'We never take a percentage of your settlement',
                    'The administrator pays your recovery directly to you',
                    'Partner referrals are always your choice, never required',
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
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink-soft">
            <Wallet className="mr-1 inline h-4 w-4 align-text-bottom text-brand-600" />
            If a settlement pays out $400, you keep the full $400. ClaimMatch takes
            nothing.
          </p>
        </div>
      </section>

      {/* FAQ ----------------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> Pricing FAQ
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">Questions about cost</h2>
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
              Because we never take a cut, our only job is to help you find and
              file every claim you&rsquo;re owed.
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
            It&rsquo;s free to check and free to file, and you keep 100% of every
            recovery. You risk nothing by looking.
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
