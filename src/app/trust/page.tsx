import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, ShieldCheck, Link2, Landmark, HandCoins, Lock, Scale,
  CheckCircle2, XCircle, Search, Eye, Database, ServerCog, ExternalLink,
  BadgeCheck,
} from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'Is ClaimMatch legit?',
  description:
    'Is ClaimMatch a scam? No. We link to the official court or administrator page for every settlement, we name who runs it, we never ask for money and never take a cut of your recovery, and you submit every claim yourself on the official site. Here is exactly why you can trust us.',
};

// The specific, verifiable reasons ClaimMatch is trustworthy.
const REASONS = [
  {
    icon: Link2,
    title: 'Every case links to the official source',
    body: 'Each settlement we surface links straight to the official court, government, or administrator page. You can read the notice yourself and confirm every detail before you do anything.',
  },
  {
    icon: Landmark,
    title: 'We name the administrator',
    body: 'We show you who is actually running each settlement — the court-appointed claims administrator — right on the card, so you can verify it independently. We are not the administrator, and we never pretend to be.',
  },
  {
    icon: HandCoins,
    title: 'Free — and we never take a cut',
    body: 'Checking, matching, and pre-filling are free. We never charge you and never take a percentage of your settlement — the administrator pays you directly. If you are ever asked to pay to claim a settlement, it is not us, and it is a red flag.',
  },
  {
    icon: ExternalLink,
    title: 'You submit on the official site',
    body: 'We pre-fill the claim and deep-link you to the administrator’s own website, where you review and submit it yourself. Your claim goes straight to the official source — no one stands between you and your payout.',
  },
  {
    icon: Lock,
    title: 'Your data is protected, never sold',
    body: 'Your information is stored on Supabase with encryption at rest and access controls, and used only to match you and pre-fill your claims. We do not sell your data, and we do not send you spam.',
  },
  {
    icon: Eye,
    title: 'You can see exactly why you matched',
    body: 'Every match comes with the plain-English reasons it surfaced, based on the answers you gave. No black boxes, no pressure — you decide what to file.',
  },
];

// How ClaimMatch protects user data, spelled out.
const DATA_POINTS = [
  {
    icon: Database,
    title: 'Encrypted at rest',
    body: 'Your profile and claim details live in a Supabase Postgres database with encryption at rest and row-level security, so your records are isolated to your account.',
  },
  {
    icon: ServerCog,
    title: 'Used only to match and pre-fill',
    body: 'We use what you tell us for one thing: matching you to settlements and pre-filling the claims you choose to file. Nothing more.',
  },
  {
    icon: XCircle,
    title: 'Never sold, never spammed',
    body: 'We never sell, rent, or trade your personal information, and we do not blast you with marketing. You control your alerts and can unsubscribe anytime.',
  },
];

// Simple steps a skeptic can take to verify us before signing up.
const VERIFY_STEPS = [
  'Open any settlement and click through to the official court or administrator page.',
  'Confirm the deadline, eligibility, and payout on that official notice.',
  'Check that you are never asked for payment or card details, and that you submit on the administrator’s own site.',
];

export default function TrustPage() {
  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Is this legit?
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              ClaimMatch is real —{' '}
              <span className="text-brand-600">and here&rsquo;s the proof.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              &ldquo;Free money from a lawsuit&rdquo; sounds like a scam — so we
              built ClaimMatch to be checkable at every step. We link to the
              official source for every case, name who runs it, never ask you for a
              dollar, and send you to the administrator&rsquo;s own site to file.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Check for free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
                <Search className="h-4 w-4" /> Browse settlements
              </Link>
            </div>
            <div className="mt-10">
              <TrustBadges />
            </div>
          </div>
        </div>
      </section>

      {/* Why you can trust us ------------------------------------------------ */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">Why you can trust us</h2>
          <p className="mt-3 text-ink-muted">
            Not vibes — specifics. Every one of these is something you can verify
            yourself before you ever file a claim.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{r.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* No money callout ---------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
            <div className="grid gap-0 sm:grid-cols-[1fr_1.1fr]">
              <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <HandCoins className="h-3.5 w-3.5" /> Free, no cut
                </div>
                <h2 className="mt-6 text-2xl font-extrabold">
                  We never touch your money.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  There is no signup fee, no subscription, and no charge to file.
                  We never take a percentage of your settlement — the administrator
                  pays your recovery directly to you. We earn referral fees from
                  partner services you choose, never from you.
                </p>
              </div>
              <div className="p-8 sm:p-10">
                <h3 className="text-base font-bold">A scam asks you to pay first.</h3>
                <ul className="mt-4 space-y-3">
                  {[
                    'We never ask for a card to check or file a claim',
                    'We never take a cut of your recovery',
                    'You submit on the administrator’s official site',
                    'Filing directly with the administrator is always free',
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

      {/* How we protect your data -------------------------------------------- */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Your data
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">How we protect your data</h2>
          <p className="mt-3 text-ink-muted">
            You share a little about yourself so we can match you and pre-fill your
            claims. We treat that with bank-level care.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {DATA_POINTS.map((d) => (
            <div
              key={d.title}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{d.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Verify us yourself -------------------------------------------------- */}
      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" /> Don&rsquo;t take our word for it
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">Verify us in 60 seconds</h2>
            <p className="mt-3 text-ink-muted">
              The best way to know we&rsquo;re legit is to check for yourself. Here
              is exactly how.
            </p>
          </div>

          <ol className="mx-auto mt-10 max-w-2xl space-y-4">
            {VERIFY_STEPS.map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 font-display text-sm font-extrabold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm text-ink-muted">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Not a law firm ------------------------------------------------------ */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-card sm:p-10">
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold">
                What we are — and what we&rsquo;re not
              </h2>
              <p className="mt-3 text-ink-muted">
                ClaimMatch is an information and matching service. We scan open
                settlements, match you to the ones you may qualify for, and pre-fill
                the official claim form so filing is quick — then link you to the
                administrator&rsquo;s own site, where you review and submit it
                yourself.
              </p>
              <p className="mt-3 text-ink-muted">
                We are <strong className="font-semibold text-ink">not a law firm</strong>,
                we do not provide legal advice, and we are not affiliated with the
                courts or the settlement administrators. We never file on your
                behalf and never take a cut of your recovery — you can always file
                directly with the administrator yourself, for free.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">Check with confidence</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            It&rsquo;s free to see what you&rsquo;re owed, and every case links back
            to the official source. You risk nothing by looking.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get matched free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="btn-secondary w-full sm:w-auto">
              See our pricing
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
