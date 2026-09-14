import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Sparkles, Scale, TrendingDown, Target, CheckCircle2,
  HandCoins, Eye, ShieldCheck, HeartHandshake, Search,
} from 'lucide-react';
import { FEE_PCT } from '@/lib/recovery';
import { Disclaimer } from '@/components/Disclaimer';
import { SITE } from '@/lib/utils';

const PCT = Math.round(FEE_PCT * 100);

export const metadata: Metadata = {
  title: 'About ClaimMatch',
  description:
    'ClaimMatch helps everyday people claim their share of the billions in class-action settlements that go unclaimed each year — free to check, honest about how we make money.',
  openGraph: {
    title: "About ClaimMatch — Claim What's Already Yours",
    description:
      'Billions in settlements go unclaimed every year. ClaimMatch matches you to settlements you qualify for and files claims on your behalf.',
    url: `${SITE.url}/about`,
    siteName: SITE.name,
    type: 'website',
  },
};

const VALUES = [
  {
    icon: Eye,
    title: 'Radical transparency',
    body: 'Every match shows the reasons it surfaced. We explain what we collect, why, and how the matching works — no black boxes.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    body: 'We never sell your personal information. Your answers are used only to match you to settlements and to let you know when new ones open.',
  },
  {
    icon: HandCoins,
    title: 'Free to check, always',
    body: "Finding your matches costs you nothing. You'll never pay us to see what you may qualify for.",
  },
  {
    icon: HeartHandshake,
    title: 'On your side',
    body: "We're here to help you claim money that's already yours — not to sell you a lawsuit or pressure you into anything.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Our mission
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Money is owed. People just{' '}
              <span className="text-brand-600">don't know it.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch exists to close the gap between the settlements people
              qualify for and the claims they actually file. We do the hunting and
              matching so ordinary people can collect what's already theirs.
            </p>
          </div>
        </div>
      </section>

      {/* The problem --------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="badge-red gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> The problem
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">
              Billions in settlements go unclaimed
            </h2>
            <p className="mt-4 text-ink-muted">
              Every year, companies settle class-action lawsuits over data breaches,
              hidden fees, defective products, and privacy violations. Those funds
              are set aside for the people who were affected — people like you.
            </p>
            <p className="mt-4 text-ink-muted">
              But most of that money is never collected. The notices look like spam,
              the deadlines are buried, and nobody tells you which cases you actually
              qualify for. So billions of dollars quietly revert back to the very
              companies that were sued.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              ['$50B+', 'left unclaimed in settlements each year'],
              ['<10%', 'of eligible people ever file a claim'],
              ['1,000s', 'of open settlements at any given time'],
              ['$0', 'it costs you to check your matches'],
            ].map(([big, small]) => (
              <div
                key={small}
                className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-card"
              >
                <div className="font-display text-3xl font-extrabold text-brand-600">
                  {big}
                </div>
                <div className="mt-1 text-sm text-ink-muted">{small}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The mission --------------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Target className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Our mission</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-muted">
            Make claiming settlement money as easy as checking your email. We
            continuously scan open cases, match each one against your profile using
            simple, transparent rules, and hand you the right claim — so the money
            that's meant for you actually reaches you.
          </p>
          <div className="mt-8">
            <Link href="/how-it-works" className="btn-secondary">
              See how it works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How we make money --------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-card">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <HandCoins className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-extrabold">How we make money</h2>
            </div>
            <p className="mt-5 text-ink-muted">
              Checking your matches and browsing settlements on ClaimMatch is free,
              and always will be. We don't charge you to find out what you qualify
              for — and we never ask for money upfront.
            </p>
            <p className="mt-4 text-ink-muted">
              When you authorize us to help you file a claim, we prepare and submit it
              to the official settlement administrator on your behalf. We take a{' '}
              <strong className="font-semibold text-ink">{PCT}%</strong> contingency
              fee only when a claim actually pays out. If you never get paid, you never
              owe us a cent. That's it — our only incentive is to win you as much
              as possible.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                'Free to check your matches',
                'We never sell your data',
                `${PCT}% fee only on money you recover`,
                'No win, no fee — ever',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-muted">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Values -------------------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold">What we stand for</h2>
            <p className="mt-3 text-ink-muted">
              Trust is the whole product. These are the principles we hold
              ourselves to.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
              >
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

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Ready to see your matches?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Set up your eligibility profile in about two minutes. Free to check —
            we'll email you when new settlements line up with your answers.
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
