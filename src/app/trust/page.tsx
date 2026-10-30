import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, ShieldCheck, ExternalLink, HandCoins, BadgeCheck, Database, Scale,
  Lock, Building2, HelpCircle, Search,
} from 'lucide-react';
import { TrustBadges } from '@/components/TrustBadges';
import { Disclaimer } from '@/components/Disclaimer';
import { BETA_FEE_COPY, feeEveryClaimCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { jsonLd } from '@/lib/jsonld';
import { legalContact } from '@/lib/legal-contact';
import { publicPageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = publicPageMetadata({
  title: 'Is this legit?',
  description:
    'The facts: it is free, it never files claims for you or touches your settlement money, its listings are labeled unverified, and it is not a law firm.',
  path: '/trust',
});

const FACTS = [
  {
    icon: ExternalLink,
    title: 'We don’t file for you',
    body: 'You file every claim yourself on the official settlement website. ClaimMatch never files or submits a claim for anyone.',
  },
  {
    icon: HandCoins,
    title: 'We never touch your money',
    body: 'If your claim is paid, the settlement administrator pays you directly. We never handle settlement payments.',
  },
  {
    icon: BadgeCheck,
    title: 'It’s free during beta',
    body: `${BETA_FEE_COPY} We will never ask you to pay to file a claim.`,
  },
  {
    icon: Database,
    title: 'Listings are labeled unverified',
    body: 'Our listings come from SettleSignal, a public data source. We haven’t checked each one yet, so we label them “Unverified” and point you to the official site.',
  },
  {
    icon: Scale,
    title: 'We’re not a law firm',
    body: 'We don’t give legal advice and can’t tell you whether you qualify. The official notice decides who qualifies.',
  },
  {
    icon: Lock,
    title: 'We don’t sell your data',
    body: 'We use your information to run your account and keep track of your claims. We don’t sell it.',
  },
];

const STORED = [
  {
    title: 'Your account',
    body: 'Your email address and password, so you can log in. Our sign-in provider stores passwords in scrambled (hashed) form, so we can’t read them.',
  },
  {
    title: 'Answers you give us',
    body: 'Your state and any answers to our short questions, such as whether you got a data-breach notice. We no longer ask about medication or medical devices.',
  },
  {
    title: 'Claims you track',
    body: 'Which settlements you’re tracking, the status you report and any confirmation numbers you add, so you can see where each claim stands.',
  },
  {
    title: 'Details you add in Settings',
    body: 'Your name and phone number, if you add them. We don’t send text messages.',
  },
  {
    title: 'How the site is used',
    body: 'Pages visited and buttons clicked, measured with PostHog and Vercel Web Analytics, so we can see what works and fix what doesn’t.',
  },
];

const VERIFY_STEPS = [
  'Open a settlement on ClaimMatch and follow its link to the official settlement site.',
  'Compare the deadline and who qualifies with what we show. If anything is different, the official site is right.',
  'Notice that we never ask you to pay, and never ask for bank or card details.',
];

const FAQ = [
  {
    q: 'Who files my claim?',
    a: 'You do, on the official settlement website. ClaimMatch never files claims for anyone. It helps you find open settlements and keep track of the claims you file.',
  },
  {
    q: 'What does ClaimMatch cost?',
    a: `${BETA_FEE_COPY} We never handle settlement payments.`,
  },
  {
    q: 'Where does your settlement information come from?',
    a: 'From SettleSignal, a public settlement data source shared under the CC BY 4.0 license. We haven’t verified each listing yet, so always check the official settlement site before you file.',
  },
  {
    q: 'Is ClaimMatch a law firm?',
    a: 'No. We don’t give legal advice, and using ClaimMatch does not make us your lawyer.',
  },
  {
    q: 'What do you do with my information?',
    a: 'We use it to run your account and keep track of your claims. We don’t sell it. Our Privacy Policy lists what we collect and who helps us run the service.',
  },
];

export default function TrustPage() {
  const contact = legalContact();
  const disclose = flags.feeDisclosure();
  const facts = disclose
    ? FACTS.map((f) =>
        f.title === 'It’s free during beta'
          ? {
              ...f,
              title: 'Official filing stays free',
              body: `${feeEveryClaimCopy()} We will never ask you to pay to file a claim.`,
            }
          : f,
      )
    : FACTS;
  const faq = disclose
    ? FAQ.map((f) =>
        f.q === 'What does ClaimMatch cost?'
          ? { ...f, a: `${feeEveryClaimCopy()} We never handle settlement payments.` }
          : f,
      )
    : FAQ;

  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Is this legit?
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Is ClaimMatch legit?{' '}
              <span className="text-brand-600">Here are the facts.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              “Free settlement money” can sound like a scam. So here is exactly what
              ClaimMatch does, what it doesn’t do, and how to check us yourself.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
                <Search className="h-4 w-4" aria-hidden /> Browse open settlements
              </Link>
              <Link href="/how-it-works" className="btn-secondary w-full sm:w-auto">
                How it works
              </Link>
            </div>
            <div className="mt-10">
              <TrustBadges />
            </div>
          </div>
        </div>
      </section>

      {/* The facts ------------------------------------------------------------ */}
      <section className="container-page py-16" aria-labelledby="facts-heading">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="facts-heading" className="text-3xl font-extrabold">The facts</h2>
          <p className="mt-3 text-ink-muted">Each one is true today, and you can check it.</p>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <li key={f.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <f.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Not the administrator ------------------------------------------------ */}
      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <Building2 className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-amber-900">
                  ClaimMatch is not the court or the settlement administrator
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-amber-900">
                  Each settlement is run by a claims administrator the court approves.
                  The administrator reviews claims and sends payments. ClaimMatch is a
                  separate website that helps you find settlements and keep track of
                  your claims. We are not part of any court or administrator.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-amber-900">
                  <strong className="font-semibold">The official settlement website is always the final word.</strong>{' '}
                  If something we show doesn’t match it, go with the official site.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What we store and why ------------------------------------------------ */}
      <section className="container-page py-16" aria-labelledby="data-heading">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge-brand mx-auto gap-1.5">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Your data
          </span>
          <h2 id="data-heading" className="mt-4 text-3xl font-extrabold">What we store and why</h2>
          <p className="mt-3 text-ink-muted">Here is what we keep, and why.</p>
        </div>
        <dl className="mx-auto mt-10 max-w-3xl divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-card">
          {STORED.map((s) => (
            <div key={s.title} className="grid gap-1 p-5 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <dt className="text-sm font-bold text-ink">{s.title}</dt>
              <dd className="text-sm text-ink-muted">{s.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mx-auto mt-6 max-w-3xl text-sm text-ink-muted">
          Your data is stored with Supabase, which encrypts stored data, and database
          rules keep each account’s records private to that account. We don’t sell your
          personal information. Read our{' '}
          <Link href="/privacy" className="font-semibold text-brand-700 underline hover:text-brand-800">
            Privacy Policy
          </Link>{' '}
          for the full list of what we collect and who helps us run ClaimMatch.
        </p>
      </section>

      {/* Check us yourself ---------------------------------------------------- */}
      <section className="bg-gray-50 py-16" aria-labelledby="verify-heading">
        <div className="container-narrow">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="verify-heading" className="text-3xl font-extrabold">Check us yourself</h2>
            <p className="mt-3 text-ink-muted">It takes about a minute.</p>
          </div>
          <ol className="mx-auto mt-10 max-w-2xl space-y-4">
            {VERIFY_STEPS.map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 font-display text-sm font-extrabold text-brand-700"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="text-sm text-ink-muted">{step}</p>
              </li>
            ))}
          </ol>
          {contact.email && (
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink-muted">
              Found something wrong? Email us at{' '}
              <a
                href={`mailto:${contact.email}`}
                className="font-semibold text-brand-700 underline hover:text-brand-800"
              >
                {contact.email}
              </a>
              .
            </p>
          )}
        </div>
      </section>

      {/* FAQ ----------------------------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="trust-faq">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="trust-faq" className="text-3xl font-extrabold">Common questions</h2>
        </div>
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {faq.map((f) => (
            <div key={f.q} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <h3 className="flex items-start gap-2 text-base font-bold">
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                {f.q}
              </h3>
              <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">{f.a}</p>
            </div>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faq.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            }),
          }}
        />
      </section>

      {/* CTA ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <h2 className="text-3xl font-extrabold">Take a look</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Browsing is free and needs no account. Always check the official settlement
            site before you file.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
            <Link href="/signup" className="btn-secondary w-full sm:w-auto">
              Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
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
