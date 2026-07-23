import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, Sparkles, CheckCircle2,
  ScanLine, ListChecks, Eye, Bell, Scale, HandCoins,
  ShieldAlert, ShoppingBag, Car, Lock, Landmark, HeartPulse,
  Briefcase, Utensils, Cpu, Gift, FileSignature, ExternalLink, Wallet,
} from 'lucide-react';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How ClaimMatch works: we scan and structure every settlement, match you by eligibility, and pre-fill the official claim form — then you review and submit on the administrator’s own site. Free, and we never take a cut.',
};

const STEPS = [
  {
    n: '01',
    icon: ScanLine,
    title: 'We scan & structure every settlement',
    body: 'Our system continuously pulls open class-action settlements from official sources, then uses AI to extract the eligibility rules, deadlines, and payouts. Every case is human-reviewed before it goes live.',
    points: [
      'Fresh cases pulled from official sources',
      'AI-extracted, then human-reviewed for accuracy',
      'Deadlines and payouts in plain English',
    ],
  },
  {
    n: '02',
    icon: ShieldCheck,
    title: 'We match you by eligibility',
    body: 'Answer a few quick questions once — your state, what you’ve bought, whether you’ve had a data breach. We compare your profile to every published settlement and surface only the ones you actually qualify for.',
    points: [
      'A 2-minute, one-time eligibility profile',
      'Every open case scored against your answers',
      'Clear reasons for why each case matched',
    ],
  },
  {
    n: '03',
    icon: FileSignature,
    title: 'We pre-fill your claim',
    body: 'For each match, we pre-fill the official claim form from your profile — name, contact details, and eligibility answers — so there’s nothing to wrestle with. You review everything before anything is submitted.',
    points: [
      'Official forms pre-filled from your profile',
      'Review and edit every detail first',
      'A tracking reference for everything you start',
    ],
  },
  {
    n: '04',
    icon: ExternalLink,
    title: 'You submit on the official site',
    body: 'We deep-link you straight to the settlement administrator’s own website, where you review the pre-filled claim and submit it yourself. When it pays out, the administrator sends the money directly to you — ClaimMatch never takes a cut.',
    points: [
      'You submit on the administrator’s official site',
      'The administrator pays you directly',
      'Free to you — we never skim your recovery',
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
    body: 'Every match comes with the plain-English reasons it surfaced, so you can see why you qualify before you review a single claim.',
  },
  {
    icon: HandCoins,
    title: 'Aligned with you',
    body: 'ClaimMatch is free and never takes a cut of your settlement. Our only incentive is to help you find and file every claim you’re owed.',
  },
  {
    icon: Bell,
    title: 'It keeps working for you',
    body: 'New settlements open every week. We re-check your profile automatically and alert you when something new lines up — pre-filled and ready to file.',
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
              We find it and pre-fill it —{' '}
              <span className="text-brand-600">you submit and keep it all.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Billions in class-action settlements go unclaimed every year because
              nobody knows they qualify or dreads the paperwork. ClaimMatch does the
              hunting, matching, and form-filling — then hands you off to the
              official site to submit and get paid directly. It&rsquo;s free.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Find my settlements <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
                <Search className="h-4 w-4" /> Browse all settlements
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-soft">
              Free to check · We pre-fill your claims · You keep 100%
            </p>
          </div>
        </div>
      </section>

      {/* The 4-step flow, expanded ------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">The full picture</h2>
          <p className="mt-3 text-ink-muted">
            We do the hunting, matching, and pre-filling. You review and submit on
            the official site. Here&rsquo;s exactly what happens.
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

      {/* Why you file it yourself -------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
            <div className="grid gap-0 sm:grid-cols-[1fr_1.1fr]">
              <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <ExternalLink className="h-3.5 w-3.5" /> You stay in control
                </div>
                <h2 className="mt-6 text-2xl font-extrabold">
                  We pre-fill. You submit. You get paid.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  Settlement administrators only accept claims filed on their own
                  sites, and that&rsquo;s a good thing: your claim goes straight to
                  the official source and the payout comes straight back to you —
                  with no one in the middle taking a slice.
                </p>
              </div>
              <div className="p-8 sm:p-10">
                <h3 className="text-base font-bold">What we do — and don&rsquo;t</h3>
                <ul className="mt-4 space-y-3">
                  {[
                    'We pre-fill the official form so filing takes seconds',
                    'We deep-link you to the administrator’s real site',
                    'You review, attest, and submit the claim yourself',
                    'The administrator pays you directly — we never take a cut',
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

      {/* How matching works -------------------------------------------------- */}
      <section className="container-page py-16">
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
      </section>

      {/* What you can claim -------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold">What you can claim</h2>
            <p className="mt-3 text-ink-muted">
              Settlements span far more than you&rsquo;d expect. If it touched your
              wallet, your data, or your day-to-day, there may be money waiting.
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
            Typical payouts range from a few dollars to several thousand — and since
            it&rsquo;s free to check and you keep everything you recover, it costs
            you nothing but a couple of minutes to find out.
          </p>
        </div>
      </section>

      {/* Pricing recap ------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-card sm:p-10">
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold">
                Always free — you keep 100% of what you recover
              </h2>
              <p className="mt-3 text-ink-muted">
                Checking, matching, and pre-filling are all free, and we never take
                a percentage of your settlement. We earn referral fees from partner
                services you choose to use — never from your recovery.
              </p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                See the full pricing breakdown <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Find what you&rsquo;re owed</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Set up your eligibility profile in about two minutes. It&rsquo;s free to
            check, we pre-fill your claims, and you keep every dollar you recover.
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
            {['Free to check', 'You keep 100%', 'You stay in control'].map((t) => (
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
