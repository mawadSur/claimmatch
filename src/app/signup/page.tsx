import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { AuthForm } from '@/components/AuthForm';

export const metadata: Metadata = {
  title: 'Sign up',
  description:
    'Create a free ClaimMatch account and get matched to class-action settlements you qualify for.',
};

const TRUST_BULLETS = [
  'Free to check — always',
  'Get matched to settlements you qualify for',
  'We email you the moment a new match opens',
];

function AuthFormFallback() {
  return (
    <div className="h-96 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-card" />
  );
}

export default function SignupPage() {
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Always free · We never take a cut
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">
              Find the settlements{' '}
              <span className="text-brand-600">you’re owed.</span>
            </h1>
            <p className="mt-3 text-ink-muted">
              Create your free account and answer a few quick questions. We’ll
              match you to open class-action settlements and help you file.
            </p>
          </div>

          <ul className="mx-auto mt-6 max-w-sm space-y-2.5">
            {TRUST_BULLETS.map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm text-ink-muted">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Suspense fallback={<AuthFormFallback />}>
              <AuthForm mode="signup" />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
