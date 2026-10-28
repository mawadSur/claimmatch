import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot your password?',
  description: 'Get a link to reset your ClaimMatch password.',
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string | string[] }>;
}) {
  const linkExpired = (await searchParams).link === 'expired';
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <h1 className="text-center text-3xl font-extrabold">Forgot your password?</h1>
          <p className="mt-2 text-center text-ink-muted">
            Enter your email and we&rsquo;ll send you a link to choose a new one.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm linkExpired={linkExpired} />
          </div>
          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
