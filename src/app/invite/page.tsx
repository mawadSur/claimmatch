import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CheckCircle2, ClipboardList, ExternalLink, Search } from 'lucide-react';
import { Disclaimer } from '@/components/Disclaimer';
import { InviteSignupCta } from '@/components/invite/InviteSignupCta';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { isInviteLandingEnabled } from '@/lib/soft-invite';

export const metadata: Metadata = {
  title: 'You’re invited',
  description:
    'Find open US class-action settlements you may qualify for, copy details into the official form, and submit on the official site. Free during beta.',
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    n: '1',
    icon: Search,
    title: 'Find open settlements',
    body: 'ClaimMatch lists class-action settlements that are still open for claims in the US.',
  },
  {
    n: '2',
    icon: ClipboardList,
    title: 'Copy a claim packet',
    body: 'We line up the details the official form usually asks for. You review them before anything is sent.',
  },
  {
    n: '3',
    icon: ExternalLink,
    title: 'You submit on the official site',
    body: 'Filing happens on the settlement’s official website. ClaimMatch is not a law firm and never files for you.',
  },
];

export default function InvitePage() {
  if (!isInviteLandingEnabled()) notFound();

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-14 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="badge-brand mx-auto">Private invite</span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">
            Find open settlements you may qualify for
          </h1>
          <p className="mt-4 text-lg text-ink-muted">
            ClaimMatch helps you find open US class-action settlements, copy a
            packet for the official form, and keep track of what you file. You
            submit on the official site. It is free during beta.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Suspense
              fallback={
                <span className="btn-primary w-full sm:w-auto opacity-70">Create a free account</span>
              }
            >
              <InviteSignupCta />
            </Suspense>
          </div>
        </div>

        <ol className="mx-auto mt-12 max-w-xl space-y-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-card"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <step.icon className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold">
                  <span className="text-brand-700">Step {step.n}.</span> {step.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul className="mx-auto mt-8 max-w-xl space-y-2 text-sm text-ink-muted">
          {[
            'Free during beta. We may introduce a fee later.',
            'Not a law firm. Not legal advice.',
            'You always file on the official settlement website yourself.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
              {line}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-10 max-w-xl space-y-6">
          <FeeDisclosure compact />
          <Disclaimer compact />
        </div>
      </div>
    </section>
  );
}
