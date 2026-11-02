import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AuthForm } from '@/components/AuthForm';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { flags } from '@/lib/flags';

export const metadata: Metadata = {
  title: 'Create your free account',
  description:
    'Create a free ClaimMatch account to keep track of the settlement claims you file on official settlement websites.',
};

const BETA_BULLETS = [
  'Free during beta. We may introduce a fee later.',
  'Browse settlements that are open for claims.',
  'Keep track of the claims you file on official sites.',
];

const DISCLOSED_BULLETS = [
  'Official filing on the administrator’s site stays free.',
  'Browse settlements that are open for claims.',
  'Keep track of the claims you file on official sites.',
];

function AuthFormFallback() {
  return (
    <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-card" />
  );
}

export default function SignupPage() {
  const bullets = flags.feeDisclosure() ? DISCLOSED_BULLETS : BETA_BULLETS;

  return (
    <section className="bg-brand-50">
      <CaptureOnce event="signup_started" />
      <div className="container-narrow py-14 sm:py-20">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              Create your free account
            </h1>
            <p className="mt-3 text-ink-muted">
              Keep track of the settlement claims you file, all in one place. You
              always file on the official settlement website yourself.
            </p>
          </div>

          <ul className="mx-auto mt-6 max-w-sm space-y-2.5">
            {bullets.map((t) => (
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
            <Link href="/terms" className="text-link">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-link">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
