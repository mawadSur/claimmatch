import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, Sparkles, CheckCircle2,
  ScanLine, ListChecks, Eye, Bell, Scale, HandCoins,
  ShieldAlert, ShoppingBag, Car, Lock, Landmark, HeartPulse,
  Briefcase, Utensils, Cpu, Gift, FileText, Wallet,
} from 'lucide-react';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import { Disclaimer } from '@/components/Disclaimer';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { SITE, canonicalUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'How ClaimMatch Works',
  description:
    'How ClaimMatch works: we scan settlements, match you by eligibility, pre-fill your claim details, and you submit free on the official site.',
  alternates: { canonical: canonicalUrl('/how-it-works') },
  openGraph: {
    title: 'How ClaimMatch Works — Find Settlements & Pre-fill Claims',
    description:
      'We scan settlements, match you by eligibility, and pre-fill your details. You submit on the official administrator site.',
    url: canonicalUrl('/how-it-works'),
    siteName: SITE.name,
    type: 'website',
  },
};

const STEPS = [
  {
    n: '01',
    icon: ScanLine,
    title: 'We scan open settlements',
    body: 'Our system continuously pulls open class-action settlements from official sources, then extracts eligibility rules, deadlines, and payouts into plain English.',
    points: [
      'Fresh cases from official sources',
      'Deadlines and payouts in plain English',
      'Every listing links to the official site',
    ],
  },
  {
    n: '02',
    icon: ShieldCheck,
    title: 'We match you by eligibility',
    body: 'Answer a few questions once — your state, what you’ve bought, whether you’ve had a data breach. We compare your profile to every published settlement and surface the ones you may qualify for.',
    points: [
      'A 2-minute, one-time eligibility profile',
      'Every open case scored against your answers',
      'Clear reasons for why each case matched',
    ],
  },
  {
    n: '03',
    icon: FileText,
    title: 'We pre-fill your claim',
    body: 'We assemble a claim packet from your profile: name, contact, and mailing address, plus a reminder of items only you have (a notice ID, receipts, account details).',
    points: [
      'Copy-all and per-field copy',
      'Details saved to your profile (with your consent)',
      'Nothing is sent to the administrator yet',
    ],
  },
  {
    n: '04',
    icon: Wallet,
    title: 'You submit on the official site',
    body: 'Open the official claim form in a new tab, paste your details, and submit under the administrator’s terms. You can mark the packet “I submitted” so your dashboard stays honest.',
    points: [
      'Filing on the official site is always free',
      'You review and attest — we never do that for you',
      'A packet on your dashboard to track what you submitted',
    ],
  },
];

const MATCH_POINTS = [
  {
    icon: ListChecks,
    title: 'Rule-based, not guesswork',
    body: 'Each settlement lists which answers qualify you — like living in a certain state or owning a certain product. We check your profile against those rules.',
  },
  {
    icon: Eye,
    title: 'Transparent by design',
    body: 'Every match comes with the plain-English reasons it surfaced, so you can see why you may qualify before you open a packet.',
  },
  {
    icon: HandCoins,
    title: 'Aligned with you',
    body: 'Using ClaimMatch is free during beta. You can always file yourself on the official site at no cost.',
  },
  {
    icon: Bell,
    title: 'It keeps working for you',
    body: 'New settlements open every week. We re-check your profile and alert you when something new lines up.',
  },
];

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
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> How it works
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              We pre-fill.{' '}
              <span className="text-brand-600">You submit.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              ClaimMatch finds open settlements you may qualify for and pre-fills
              your claim details. You review them and submit free on the official
              administrator site.
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
              Free to check · You submit on the official site · Free during beta
            </p>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">The full picture</h2>
          <p className="mt-3 text-ink-muted">
            Four steps from an open settlement to a claim you submitted yourself.
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

      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Transparent matching
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">How matching actually works</h2>
          <p className="mt-3 text-ink-muted">
            No black boxes. Matching is rule-based and driven by the answers you
            give — you can always see why a settlement showed up.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {MATCH_POINTS.map((m) => (
            <div key={m.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <m.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{m.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold">What you can claim</h2>
            <p className="mt-3 text-ink-muted">
              Settlements span far more than you’d expect. If it touched your
              wallet, your data, or your day-to-day, there may be a claim window open.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LAWSUIT_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] ?? Gift;
              return (
                <div
                  key={cat}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-card"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-ink">{cat}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <HowWeMakeMoney />
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Scale className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Find settlements you may qualify for</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Set up your eligibility profile in about two minutes. We pre-fill;
            you submit on the official site.
          </p>
          <div className="mx-auto mt-6 max-w-xl">
            <FeeDisclosure compact />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get matched free <ArrowRight className="h-4 w-4" />
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
