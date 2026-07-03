import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, FileText, Sparkles, CheckCircle2,
  ScanLine, ListChecks, Eye, ClipboardCheck, Bell, Scale,
  ShieldAlert, ShoppingBag, Car, Lock, Landmark, HeartPulse,
  Briefcase, Utensils, Cpu, Gift,
} from 'lucide-react';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How ClaimMatch works: we scan open class-action settlements, match you to the ones you qualify for based on your answers, and help you file the right claim.',
};

const STEPS = [
  {
    n: '01',
    icon: ScanLine,
    title: 'We scan the settlements',
    body: 'Our system continuously pulls open class-action settlements and lawsuits from official sources into one searchable place — so you never have to hunt through legal notices again.',
    points: [
      'Fresh cases added as they open',
      'Deadlines, payouts, and proof needs in plain English',
      'Official settlement links, never spam',
    ],
  },
  {
    n: '02',
    icon: ShieldCheck,
    title: 'We match you',
    body: 'Answer a few quick questions once — your state, what you’ve bought, whether you’ve had a data breach. We compare your profile to every case and surface only the ones you actually qualify for.',
    points: [
      'A 2-minute, one-time eligibility profile',
      'Every open case scored against your answers',
      'Clear reasons for why each case matched',
    ],
  },
  {
    n: '03',
    icon: FileText,
    title: 'You file in minutes',
    body: 'We point you to the right official claim form, pre-fill what we can, and walk you through the rest. Then we email you the moment a new match opens up.',
    points: [
      'Step-by-step guidance to the official claim',
      'A receipt number to track what you’ve filed',
      'Email alerts when fresh matches appear',
    ],
  },
];

const MATCH_POINTS = [
  {
    icon: ListChecks,
    title: 'Rule-based, not guesswork',
    body: 'Each settlement lists exactly which answers qualify you — like living in a certain state or owning a certain product. We check your profile against those rules.',
  },
  {
    icon: Eye,
    title: 'Transparent by design',
    body: 'Every match comes with the plain-English reasons it surfaced, so you can see why you qualify before you spend a second on a claim.',
  },
  {
    icon: ClipboardCheck,
    title: 'You stay in control',
    body: 'We only ever suggest matches. You decide which claims to file, and you can dismiss anything that isn’t a fit.',
  },
  {
    icon: Bell,
    title: 'It keeps working for you',
    body: 'New settlements open every week. We re-check your profile automatically and email you when something new lines up.',
  },
];

// A friendly icon for each claim category we cover.
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
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> How it works
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              From open case to filed claim —{' '}
              <span className="text-brand-600">in three steps.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Billions in class-action settlements go unclaimed every year because
              nobody knows they qualify. ClaimMatch does the hunting and matching, so
              all you have to do is claim.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Find my settlements <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
                <Search className="h-4 w-4" /> Browse all settlements
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The 3-step flow, expanded ------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">The full picture</h2>
          <p className="mt-3 text-ink-muted">
            We do the hunting. You do the claiming. Here’s exactly what happens.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:grid-cols-[auto_1fr] sm:p-8"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <s.icon className="h-6 w-6" />
                </div>
                <span className="font-display text-4xl font-extrabold text-brand-100 sm:hidden">
                  {s.n}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <span className="hidden font-display text-2xl font-extrabold text-brand-200 sm:inline">
                    {s.n}
                  </span>
                  <h3 className="text-xl font-bold">{s.title}</h3>
                </div>
                <p className="mt-2 max-w-2xl text-ink-muted">{s.body}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-ink-muted">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How matching works -------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Transparent matching
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">How matching actually works</h2>
            <p className="mt-3 text-ink-muted">
              No black boxes. Matching is rule-based and driven entirely by the
              answers you give — you can always see why a settlement showed up.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {MATCH_POINTS.map((m) => (
              <div
                key={m.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <m.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{m.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can claim -------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">What you can claim</h2>
          <p className="mt-3 text-ink-muted">
            Settlements span far more than you’d expect. If it touched your wallet,
            your data, or your day-to-day, there may be money waiting.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LAWSUIT_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] ?? Gift;
            return (
              <div
                key={cat}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold text-ink">{cat}</span>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-soft">
          Typical payouts range from a few dollars to several thousand — many
          settlements pay small amounts with no proof required, so it costs you
          nothing but a couple of minutes to check.
        </p>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Find what you’re owed</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Set up your eligibility profile in about two minutes. It’s free to
            check, and we’ll email you the moment new matches open up.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get matched free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
              <Search className="h-4 w-4" /> Browse settlements
            </Link>
          </div>
          <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            {['Free to check', 'No spam, ever', 'Unsubscribe anytime'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success-500" /> {t}
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-10 max-w-2xl text-left">
            <Disclaimer />
          </div>
        </div>
      </section>
    </>
  );
}
