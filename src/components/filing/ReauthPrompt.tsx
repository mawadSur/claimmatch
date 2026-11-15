'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import { createClient } from '@/lib/supabase/client';
import { googleReauthRequest, startGoogleSignIn } from '../GoogleSignInButton';
import { FieldError, FormMessage, describedBy } from './ui';

const COPY = ONE_CLICK_COPY.reauth;

/**
 * "For your security, sign in again": signing a claim needs a password
 * sign-in in the last 15 minutes (an email link never counts). The member
 * signs in again here with their account's email and password; members
 * without a password set one through the reset-password flow first.
 *
 * Members with a Google identity (and OAUTH_SIGN_IN_ENABLED on) can sign in
 * again with Google instead: it leaves for Google and comes back to this same
 * claim page, whose fresh-sign-in check then sees the new 'oauth' amr entry.
 * A Google-only member has no password, so without this they could never sign.
 */
export function ReauthPrompt({
  email,
  google = false,
  onSignedIn,
}: {
  /** The account's sign-in email (not the claim's contact email). */
  email: string | null;
  /** Offer "Sign in again with Google" (the account has a Google identity and the flag is on). */
  google?: boolean;
  onSignedIn: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'google' | 'done'>('idle');

  async function withGoogle() {
    if (status === 'google' || status === 'checking') return;
    setError(null);
    setStatus('google');
    // Back to this claim page; /auth/callback keeps only a same-site path.
    const failed = await startGoogleSignIn(googleReauthRequest(window.location, email));
    if (failed) {
      setStatus('idle');
      setError(COPY.googleFailed);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError(COPY.enter);
      document.getElementById('filing-reauth-password')?.focus();
      return;
    }
    if (!email) {
      setError(COPY.wrong);
      return;
    }
    setStatus('checking');
    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        setStatus('idle');
        setError(COPY.wrong);
        document.getElementById('filing-reauth-password')?.focus();
        return;
      }
    } catch {
      setStatus('idle');
      setError(ONE_CLICK_COPY.network);
      return;
    }
    setPassword('');
    setStatus('done');
    await onSignedIn();
  }

  if (status === 'done') return <FormMessage tone="success">{COPY.done}</FormMessage>;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="filing-reauth-title"
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <h3 id="filing-reauth-title" className="flex items-center gap-2 text-sm font-bold text-ink">
        <KeyRound className="h-4 w-4 text-amber-700" aria-hidden />
        {COPY.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{google ? COPY.googleBody : COPY.body}</p>
      {google && (
        <div className="mt-3">
          <button
            type="button"
            id="filing-reauth-google"
            className="btn-primary"
            onClick={() => void withGoogle()}
            disabled={status === 'google' || status === 'checking'}
          >
            {status === 'google' ? COPY.googleWorking : COPY.google}
          </button>
          <p className="mt-3 text-sm font-semibold text-ink">{COPY.orPassword}</p>
        </div>
      )}
      {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
      <label htmlFor="filing-reauth-password" className="field-label mt-3">
        {COPY.password}
      </label>
      <input
        id="filing-reauth-password"
        type="password"
        autoComplete="current-password"
        className="field-input sm:max-w-sm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={describedBy(error && 'filing-reauth-error')}
        aria-invalid={error ? true : undefined}
      />
      <FieldError id="filing-reauth-error" message={error} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className={google ? 'btn-secondary' : 'btn-primary'} disabled={status === 'checking' || status === 'google'}>
          {status === 'checking' ? COPY.checking : COPY.submit}
        </button>
        <span className="text-sm text-ink-muted">
          {COPY.noPassword}{' '}
          <Link href="/forgot-password" className="inline-flex min-h-tap items-center font-semibold text-brand-700 underline underline-offset-2">
            {COPY.setPassword}
          </Link>
        </span>
      </div>
    </form>
  );
}
