import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Sparkles, Scale, TrendingDown, Target,
  HandCoins, Eye, ShieldCheck, HeartHandshake, Search,
} from 'lucide-react';
import { Disclaimer } from '@/components/Disclaimer';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { SITE, canonicalUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'About ClaimMatch',
  description:
    'ClaimMatch helps everyday people find open class-action settlements they may qualify for — with official claim links and pre-filled claim details.',
  alternates: { canonical: canonicalUrl('/about') },
  openGraph: {
    title: 'About ClaimMatch — Find settlements you may qualify for',
    description:
      'ClaimMatch matches you to open settlements and pre-fills claim details. You submit on the official site.',
    url: canonicalUrl('/about'),
    siteName: SITE.name,
    type: 'website',
  },
};

const VALUES = [
  {
    icon: Eye,
    title: 'Radical transparency',
    body: 'Every match shows the reasons it surfaced. We explain what we collect, why, and how matching works.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    body: 'We never sell your personal information. Your answers are used to match you and to pre-fill packets you open.',
  },
  {
    icon: HandCoins,
    title: 'Free to check, always',
    body: 'Finding your matches costs you nothing. Filing on the official site is always free.',
  },
  {
    icon: HeartHandshake,
    title: 'On your side',
    body: 'We’re here to help you find money that may already be yours — not to pressure you into anything.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Our mission
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Money may be owed. People just{' '}
              <span className="text-brand-600">don’t know it.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch exists to close the gap between the settlements people
              may qualify for and the claims they actually file. We do the hunting
              and matching; you review and submit on the official site.
            </p>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="badge-red gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> The problem
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">
              Most settlement money is never claimed
            </h2>
            <p className="mt-4 text-ink-muted">
              Every year, companies settle class-action lawsuits over data breaches,
              hidden fees, defective products, and privacy violations. Those funds
              are set aside for the people who were affected.
            </p>
            <p className="mt-4 text-ink-muted">
              The notices look like spam, the deadlines are buried, and nobody tells
              you which cases you may actually qualify for. So a large share of that
              money goes unclaimed.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              ['Official links', 'on every settlement we publish'],
              ['You submit', 'on the administrator’s site, free'],
              ['Open catalog', 'real cases, nearest deadline first'],
              ['$0', 'to check your matches'],
            ].map(([big, small]) => (
              <div key={small} className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-card">
                <div className="font-display text-3xl font-extrabold text-brand-600">{big}</div>
                <div className="mt-1 text-sm text-ink-muted">{small}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Target className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Our mission</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-muted">
            Make finding and preparing a settlement claim as easy as checking
            email. We scan open cases, match them against your profile, and hand
            you a pre-filled packet — you submit it yourself.
          </p>
          <div className="mt-8">
            <Link href="/how-it-works" className="btn-secondary">
              See how it works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <HowWeMakeMoney />
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold">What we stand for</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <v.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Ready to see your matches?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Set up your eligibility profile in about two minutes. Free to check —
            we’ll email you when new settlements line up with your answers.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Find my settlements <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
              <Search className="h-4 w-4" /> Browse settlements
            </Link>
          </div>
          <div className="mx-auto mt-10 max-w-2xl text-left">
            <Disclaimer />
          </div>
        </div>
      </section>
    </>
  );
}
