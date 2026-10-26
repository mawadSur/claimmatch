import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, ShieldCheck, Link2, Landmark, Lock, Scale,
  CheckCircle2, XCircle, Search, Eye, Database, ServerCog,
  BadgeCheck, Building2, ExternalLink, HelpCircle,
} from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { SITE, canonicalUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Is ClaimMatch legit?',
  description:
    'Is ClaimMatch a scam? No. We link to the official court or administrator page for every settlement, we name who runs it, and you submit every claim yourself.',
  alternates: { canonical: canonicalUrl('/trust') },
  openGraph: {
    title: "Is ClaimMatch legit? Here's the proof.",
    description:
      'We link to official court pages, name who runs each settlement, and you submit on the official site.',
    url: canonicalUrl('/trust'),
    siteName: SITE.name,
    type: 'website',
  },
};

const KNOWN_ADMINISTRATORS = [
  { name: 'JND Legal Administration', url: 'https://www.jndla.com' },
  { name: 'Angeion Group', url: 'https://www.angeiongroup.com' },
  { name: 'Epiq', url: 'https://www.epiqglobal.com' },
  { name: 'Kroll Settlement Administration', url: 'https://www.krollsettlementadministration.com' },
];

const TRUST_FAQ = [
  {
    q: 'How does ClaimMatch matching work?',
    a: 'You answer a few questions about your state, past purchases, and data breaches you may have been part of. We compare your answers against the published eligibility rules for every open settlement and surface the ones you may qualify for — with clear reasons for each match.',
  },
  {
    q: 'What does ClaimMatch cost?',
    a: 'Checking your matches is always free. Using ClaimMatch is free during beta. Filing on the official administrator site is always free, and you never need ClaimMatch to file.',
  },
  {
    q: 'Is ClaimMatch a law firm?',
    a: 'No. ClaimMatch is an information and matching service. We help you discover settlements and pre-fill claim details. We are not attorneys and do not provide legal advice.',
  },
];

const REASONS = [
  {
    icon: Link2,
    title: 'Every case links to the official source',
    body: 'Each settlement we surface links straight to the official court, government, or administrator page. You can read the notice yourself before you do anything.',
  },
  {
    icon: Landmark,
    title: 'We name the administrator',
    body: 'We show you who is actually running each settlement — the court-appointed claims administrator. We are not the administrator, and we never pretend to be.',
  },
  {
    icon: Lock,
    title: 'Your data stays on your account',
    body: 'Your information is stored on Supabase with encryption at rest and row-level security, and used to match you and pre-fill packets you ask for. We do not sell your data.',
  },
  {
    icon: Scale,
    title: 'A matching service, not a law firm',
    body: 'ClaimMatch helps you find settlements and pre-fill details. We are not a law firm and do not provide legal advice. You submit every claim yourself.',
  },
  {
    icon: Eye,
    title: 'You can see exactly why you matched',
    body: 'Every match comes with the plain-English reasons it surfaced, based on the answers you gave. No black boxes.',
  },
  {
    icon: CheckCircle2,
    title: 'You submit. We don’t.',
    body: 'ClaimMatch pre-fills a packet. You review it and submit on the official site under the administrator’s terms.',
  },
];

const DATA_POINTS = [
  {
    icon: Database,
    title: 'Encrypted at rest',
    body: 'Your profile and claim details live in a Supabase Postgres database with encryption at rest and row-level security.',
  },
  {
    icon: ServerCog,
    title: 'Used to match and pre-fill',
    body: 'We use what you tell us to match you to settlements and to pre-fill packets you open. Nothing more.',
  },
  {
    icon: XCircle,
    title: 'Never sold',
    body: 'We never sell, rent, or trade your personal information. You control your alerts and can unsubscribe anytime.',
  },
];

export default function TrustPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Is this legit?
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              ClaimMatch is real —{' '}
              <span className="text-brand-600">and here’s the proof.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              We link to the official source for every case, name who runs it, and
              you submit every claim yourself on the administrator’s site.
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

      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">Why you can trust us</h2>
          <p className="mt-3 text-ink-muted">
            Specifics you can verify before you ever open a packet.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{r.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-amber-900">
                    ClaimMatch is not the court or settlement administrator
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-amber-800">
                    Class-action settlements are administered by court-appointed
                    companies — not ClaimMatch. We help you find settlements and
                    pre-fill details. You submit on the official site. The official
                    source is always authoritative.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-10 max-w-3xl">
            <h3 className="text-center text-lg font-bold">Common settlement administrators</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {KNOWN_ADMINISTRATORS.map((admin) => (
                <a
                  key={admin.name}
                  href={admin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm font-medium text-ink transition hover:border-brand-200 hover:bg-brand-50"
                >
                  {admin.name}
                  <ExternalLink className="h-4 w-4 shrink-0 text-ink-soft" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <HowWeMakeMoney />
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Your data
          </span>
          <h2 className="mt-4 text-3xl font-extrabold">How we protect your data</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {DATA_POINTS.map((d) => (
            <div key={d.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{d.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{d.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
          Data: SettleSignal (
          <a href="https://settlesignal.com/data/" className="font-semibold text-brand-700 underline" target="_blank" rel="noopener noreferrer">
            settlesignal.com
          </a>
          ), CC-BY 4.0. Processors: Supabase, Vercel, PostHog, Resend, and Anthropic when extraction is enabled.
        </p>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-narrow">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" /> Don’t take our word for it
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">Verify us in 60 seconds</h2>
          </div>
          <ol className="mx-auto mt-10 max-w-2xl space-y-4">
            {[
              'Open any settlement and click through to the official court or administrator page.',
              'Confirm the deadline, eligibility, and payout on that official notice.',
              'Check that you are never asked for a card to file a claim on the official site.',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 font-display text-sm font-extrabold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm text-ink-muted">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" /> Common questions
            </span>
            <h2 className="mt-4 text-3xl font-extrabold">FAQ</h2>
          </div>
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {TRUST_FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
                <h3 className="flex items-start gap-2 text-base font-bold">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  {f.q}
                </h3>
                <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: TRUST_FAQ.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            }),
          }}
        />
      </section>

      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-extrabold">Check with confidence</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            It’s free to see what you may qualify for, and every case links back
            to the official source.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get matched free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/how-we-make-money" className="btn-secondary w-full sm:w-auto">
              How we make money
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
