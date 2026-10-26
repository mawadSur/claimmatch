import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthForm } from '@/components/AuthForm';
import { safeNextPath } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to ClaimMatch to see and update the settlement claims you are tracking.',
};

function AuthFormFallback() {
  return (
    <div className="h-80 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-card" />
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  // "Start your claim" sends signed-out visitors here, most of them new: don't
  // greet them with "Welcome back" and hide sign-up in a small link.
  const fromClaim = next?.startsWith('/claim/') ?? false;
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="mt-5 text-3xl font-extrabold">
              {fromClaim ? 'Log in or create a free account' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-ink-muted">
              {fromClaim
                ? 'You need a free account to keep track of this claim. You still file on the official site yourself.'
                : 'Log in to see and update the claims you are tracking.'}
            </p>
          </div>

          <div className="mt-8">
            <Suspense fallback={<AuthFormFallback />}>
              <AuthForm mode="login" />
            </Suspense>
          </div>

          {fromClaim && next && (
            <div className="mt-6 text-center">
              <p className="text-sm text-ink-muted">New to ClaimMatch?</p>
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="btn-secondary mt-2 w-full"
              >
                Create a free account
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
