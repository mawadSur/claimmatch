import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Search, Eye, UserCheck, HandCoins, ShieldCheck, MailX, FileText,
  ShieldAlert, Target,
} from 'lucide-react';
import { Disclaimer } from '@/components/Disclaimer';
import { SITE } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'About ClaimMatch',
  description:
    'ClaimMatch is a free claim assistant. It helps people find open class-action settlements, file on the official settlement site, and keep track of their claims.',
  openGraph: {
    title: 'About ClaimMatch',
    description:
      'A free claim assistant for class-action settlements. You file on the official site; we help you find settlements and keep track.',
    url: `${SITE.url}/about`,
    siteName: SITE.name,
    type: 'website',
  },
};

const HARD_PARTS = [
  { icon: MailX, text: 'Settlement notices are easy to miss or mistake for spam.' },
  { icon: FileText, text: 'Deadlines and rules are buried in long legal documents.' },
  { icon: ShieldAlert, text: 'Scams make it hard to tell which settlement sites are real.' },
];

const VALUES = [
  {
    icon: Eye,
    title: 'Honest about what we know',
    body: 'We show where our information comes from and label listings we haven’t checked. The official settlement site is always the final word.',
  },
  {
    icon: UserCheck,
    title: 'You stay in charge',
    body: 'You decide which claims to file, and you file them yourself on the official site. We never act for you.',
  },
  {
    icon: HandCoins,
    title: 'Free, with no cut',
    body: 'ClaimMatch is free to use. We never take a share of any settlement payment.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    body: 'We don’t sell your personal information, we don’t ask about your health, and you can ask us to delete your account.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto">About us</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Settlement claims should be{' '}
              <span className="text-brand-600">simple and honest.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Class-action settlements set money aside for people who were affected.
              ClaimMatch is a free claim assistant that helps you find settlements that
              are open, check the official details, and keep track of the claims you file.
            </p>
          </div>
        </div>
      </section>

      {/* Why claiming is hard ------------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="hard-heading">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <h2 id="hard-heading" className="text-3xl font-extrabold">
              Why claiming is hard
            </h2>
            <p className="mt-4 text-ink-muted">
              Companies settle class-action lawsuits over things like data breaches,
              hidden fees, faulty products and privacy problems. People who were
              affected can often file a claim. But many never hear about it in time, or
              aren’t sure the settlement is real.
            </p>
            <p className="mt-4 text-ink-muted">
              ClaimMatch puts open settlements in one place, sends you to the official
              site to file, and helps you remember what you’ve filed.
            </p>
          </div>
          <ul className="space-y-4">
            {HARD_PARTS.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-sm text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Our goal ------------------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Target className="h-6 w-6" aria-hidden />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Our goal</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-muted">
            Make it easy to find real, open settlements and to file on the official
            site with confidence, without paying anyone and without giving up control.
          </p>
          <div className="mt-8">
            <Link href="/how-it-works" className="btn-secondary">
              See how it works <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* What we stand for ---------------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="values-heading">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="values-heading" className="text-3xl font-extrabold">What we stand for</h2>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2">
          {VALUES.map((v) => (
            <li key={v.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <v.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{v.body}</p>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
          Is it really free? Yes.{' '}
          <Link href="/pricing" className="font-semibold text-brand-700 underline hover:text-brand-800">
            See pricing
          </Link>
          .
        </p>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-extrabold">See what’s open now</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Browse settlements that are open for claims. Create a free account when
            you want to keep track of the claims you file.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
            <Link href="/signup" className="btn-secondary w-full sm:w-auto">
              Create a free account
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
