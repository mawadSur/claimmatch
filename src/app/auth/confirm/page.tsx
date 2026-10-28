import type { Metadata } from 'next';
import { MailCheck, KeyRound, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { parseConfirmType, parseTokenHash } from '@/lib/auth-confirm';
import { safeNextPath } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * Scanner-safe landing page for email links. Opening it (as mail scanners do)
 * changes nothing: the one-time token is only used when the person presses
 * the button, which POSTs to /auth/confirm/verify.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tokenHash = parseTokenHash(sp.token_hash);
  const type = parseConfirmType(sp.type);
  const next = safeNextPath(sp.next);
  const recovery = type === 'recovery';

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-card">
          {!tokenHash || !type ? (
            <>
              <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-extrabold">This link isn&rsquo;t complete</h1>
              <p className="mt-2 text-ink-muted">
                Open the link from your email again, or request a new one.
              </p>
              <Link href={recovery ? '/forgot-password' : '/login'} className="btn-secondary mt-6 w-full">
                {recovery ? 'Request a new reset link' : 'Go to log in'}
              </Link>
            </>
          ) : (
            <>
              {recovery ? (
                <KeyRound className="mx-auto h-8 w-8 text-brand-700" aria-hidden />
              ) : (
                <MailCheck className="mx-auto h-8 w-8 text-brand-700" aria-hidden />
              )}
              <h1 className="mt-4 text-2xl font-extrabold">
                {recovery ? 'Reset your password' : 'Confirm your email'}
              </h1>
              <p className="mt-2 text-ink-muted">
                {recovery
                  ? 'Press the button to continue and choose a new password.'
                  : 'Press the button to confirm your email and finish setting up your account.'}
              </p>
              <form method="post" action="/auth/confirm/verify" className="mt-6">
                <input type="hidden" name="token_hash" value={tokenHash} />
                <input type="hidden" name="type" value={type} />
                {next && <input type="hidden" name="next" value={next} />}
                <button type="submit" className="btn-primary w-full">
                  {recovery ? 'Continue to reset password' : 'Confirm my email'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
