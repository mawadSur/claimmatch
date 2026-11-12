import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { MATCH_ALERT_START_API_PATH, MATCH_ALERT_TOKEN_PARAM } from '@/lib/match-alert-token';
import { PUBLIC_BRAND } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Start this claim',
  robots: { index: false, follow: false },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Scanner-safe landing for match-alert "Start this claim" links. Opening the
 * page does not consume the token; the button POSTs to the API. One tap.
 */
export default async function MatchAlertStartPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const token = first(sp[MATCH_ALERT_TOKEN_PARAM])?.trim() ?? '';
  const error = first(sp.error);

  let heading = 'Start this claim';
  let body = 'One tap to continue. We’ll sign you in with the email this alert was sent to.';
  if (error === 'used') {
    heading = 'This link was already used';
    body = 'Each start link works once. Open the settlement from your dashboard, or request a new match alert.';
  } else if (error === 'expired') {
    heading = 'This link has expired';
    body = 'Start links expire after 72 hours. Sign in to review open settlements, or wait for the next match alert.';
  } else if (error === 'busy') {
    heading = 'Too many tries';
    body = 'Wait a minute and press the button in your email again.';
  } else if (error === 'invalid' || (error && !token)) {
    heading = 'This link isn’t complete';
    body = 'Open the Start this claim button from your email again.';
  }

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-12 sm:py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">{PUBLIC_BRAND}</p>
          {token && !error ? (
            <>
              <h1 className="mt-3 text-2xl font-extrabold">{heading}</h1>
              <p className="mt-2 text-ink-muted">{body}</p>
              <form method="post" action={MATCH_ALERT_START_API_PATH} className="mt-6">
                <input type="hidden" name={MATCH_ALERT_TOKEN_PARAM} value={token} />
                <button type="submit" className="btn-primary w-full text-lg" autoFocus>
                  Start this claim
                </button>
              </form>
            </>
          ) : (
            <>
              <AlertCircle className="mx-auto mt-4 h-8 w-8 text-red-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-extrabold">{heading}</h1>
              <p className="mt-2 text-ink-muted">{body}</p>
              <Link href="/login" className="btn-secondary mt-6 w-full">
                Go to log in
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
