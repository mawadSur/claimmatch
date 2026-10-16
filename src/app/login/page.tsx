import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthForm } from '@/components/AuthForm';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to ClaimMatch to see and update the settlement claims you are tracking.',
};

function AuthFormFallback() {
  return (
    <div className="h-80 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-card" />
  );
}

export default function LoginPage() {
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="mt-5 text-3xl font-extrabold">Welcome back</h1>
            <p className="mt-2 text-ink-muted">
              Log in to see and update the claims you are tracking.
            </p>
          </div>

          <div className="mt-8">
            <Suspense fallback={<AuthFormFallback />}>
              <AuthForm mode="login" />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
