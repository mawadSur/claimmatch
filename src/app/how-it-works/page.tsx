import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Search, ListChecks, ExternalLink, ClipboardCheck, CheckCircle2,
  Database, Info, ShieldAlert, ShoppingBag, Car, Lock, Landmark, HeartPulse,
  Briefcase, Utensils, Cpu, Gift,
} from 'lucide-react';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import { Disclaimer } from '@/components/Disclaimer';
import { SITE } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'How ClaimMatch Works',
  description:
    'How ClaimMatch works: find a settlement that is open for claims, check who qualifies on the official notice, file on the official site yourself, and keep track of your claim. Free.',
  openGraph: {
    title: 'How ClaimMatch works',
    description:
      'Find open settlements, check who qualifies on the official notice, file on the official site, and keep track. Free.',
    url: `${SITE.url}/how-it-works`,
    siteName: SITE.name,
    type: 'website',
  },
};

const STEPS = [
  {
    n: '1',
    icon: Search,
    title: 'Find an open settlement',
    body: 'Browse settlements that are open for claims. Each listing shows the deadline we have on file and, when our source lists it, a link to the official settlement site.',
    points: [
      'The closest deadlines are easy to spot',
      'Listings are unverified for now, so check the official site',
    ],
  },
  {
    n: '2',
    icon: ListChecks,
    title: 'Check if you qualify',
    body: 'Open the official notice and read who qualifies. File only if it describes you. Filing a claim you don’t qualify for can be against the law.',
    points: [
      'The official notice is the final word',
      'We’re not a law firm, so we can’t tell you if you qualify',
    ],
  },
  {
    n: '3',
    icon: ExternalLink,
    title: 'File on the official site',
    body: 'Fill out and send the claim form on the settlement’s official website. ClaimMatch never files or submits a claim for you.',
    points: [
      'Filing on the official site is free',
      'Save the confirmation number the site gives you',
    ],
  },
  {
    n: '4',
    icon: ClipboardCheck,
    title: 'Keep track in ClaimMatch',
    body: 'Come back and tell us you filed. Add your confirmation number if you got one. Your claims stay in one list, so you can see what’s done and what isn’t.',
    points: [
      'Your claim shows “Submitted” only after you add the confirmation number',
      'If your claim is paid, the administrator pays you directly',
    ],
  },
];

const STATUSES = [
  {
    label: 'Not filed yet',
    body: 'You’re tracking this settlement but haven’t told us you filed.',
  },
  {
    label: 'Reported filed by you',
    body: 'You told us you filed on the official site. We don’t have a confirmation number yet.',
  },
  {
    label: 'Submitted · #…',
    body: 'You added the confirmation number from the official site. We show it next to the status.',
  },
  {
    label: 'Not reported filed',
    body: 'The deadline passed and you didn’t tell us you filed.',
  },
];

// A friendly icon for each settlement category.
const CATEGORY_ICONS: Record<string, typeof Gift> = {
  'Data Breach': ShieldAlert,
  'Consumer Products': ShoppingBag,
  'Auto & Vehicles': Car,
  Privacy: Lock,
  'Financial & Banking': Landmark,
  'Health & Pharma': HeartPulse,
  Employment: Briefcase,
  'Food & Beverage': Utensils,
  Technology: Cpu,
  General: Gift,
};

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto">How it works</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              You file. <span className="text-brand-600">We help you stay on top of it.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch is a free claim assistant. We help you find settlements that
              are open, point you to the official notice and claim site, and keep track
              of the claims you file. You always file on the official site yourself.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
                <Search className="h-4 w-4" aria-hidden /> Browse open settlements
              </Link>
              <Link href="/signup" className="btn-secondary w-full sm:w-auto">
                Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The four steps ------------------------------------------------------- */}
      <section className="container-page py-12" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="sr-only">The four steps</h2>
        <ol className="space-y-6">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="grid gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:grid-cols-[auto_1fr] sm:p-8"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <s.icon className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  <span className="text-brand-700">Step {s.n}.</span> {s.title}
                </h3>
                <p className="mt-2 max-w-2xl text-ink-muted">{s.body}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-ink-muted">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Claim statuses ------------------------------------------------------- */}
      <section className="bg-gray-50 py-16" aria-labelledby="status-heading">
        <div className="container-narrow">
          <div className="text-center">
            <h2 id="status-heading" className="text-3xl font-extrabold">
              What your claim status means
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
              Your claim’s status in ClaimMatch is based on what you tell us. The
              settlement administrator decides whether a claim is approved and paid.
            </p>
          </div>
          <dl className="mt-10 space-y-4">
            {STATUSES.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:flex-row sm:items-start sm:gap-5"
              >
                <dt className="shrink-0 sm:w-56">
                  <span className="badge-gray">{s.label}</span>
                </dt>
                <dd className="text-sm text-ink-muted">{s.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Where listings come from -------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="source-heading">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <Database className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h2 id="source-heading" className="text-xl font-extrabold text-amber-900">
                Where our listings come from
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-amber-900">
                Our settlement listings come from{' '}
                <a
                  href="https://settlesignal.com/data/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  SettleSignal
                </a>
                , a public settlement data source shared under the CC BY 4.0 license. We
                haven’t checked each listing ourselves yet, so each one is labeled
                “Unverified: check the official site.”
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-amber-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Deadlines and details can change. The official settlement website is
                always the final word, including the exact cutoff time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Kinds of settlements ------------------------------------------------- */}
      <section className="bg-gray-50 py-16" aria-labelledby="kinds-heading">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="kinds-heading" className="text-3xl font-extrabold">
              Kinds of settlements
            </h2>
            <p className="mt-3 text-ink-muted">
              Class-action settlements cover many everyday things, from data breaches
              to products you bought.
            </p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LAWSUIT_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] ?? Gift;
              return (
                <li
                  key={cat}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-card"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-ink">{cat}</span>
                </li>
              );
            })}
          </ul>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
            Each settlement decides what it pays and who can claim. Check the official
            notice for the details.
          </p>
        </div>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-extrabold">Ready to look?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            It’s free. We never take a cut of your settlement.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
            <Link href="/pricing" className="btn-secondary w-full sm:w-auto">
              Is it really free?
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
