import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AuthForm } from '@/components/AuthForm';

export const metadata: Metadata = {
  title: 'Create your free account',
  description:
    'Create a free ClaimMatch account to keep track of the settlement claims you file on official settlement websites.',
};

const BULLETS = [
  'Free to use. We never take a cut of your settlement.',
  'Browse settlements that are open for claims.',
  'Keep track of the claims you file on official sites.',
];

function AuthFormFallback() {
  return (
    <div className="h-96 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-card" />
  );
}

const LEGAL_LINK =
  'font-semibold text-brand-700 underline hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

export default function SignupPage() {
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Free claim assistant
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">
              Create your free account
            </h1>
            <p className="mt-3 text-ink-muted">
              Keep track of the settlement claims you file, all in one place. You
              always file on the official settlement website yourself.
            </p>
          </div>

          <ul className="mx-auto mt-6 max-w-sm space-y-2.5">
            {BULLETS.map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm text-ink-muted">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Suspense fallback={<AuthFormFallback />}>
              <AuthForm mode="signup" />
            </Suspense>
          </div>

          <p className="mt-4 text-center text-sm text-ink-muted">
            By creating an account, you agree to the{' '}
            <Link href="/terms" className={LEGAL_LINK}>
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className={LEGAL_LINK}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
