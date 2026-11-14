'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import { createClient } from '@/lib/supabase/client';
import { FieldError, FormMessage, describedBy } from './ui';

const COPY = ONE_CLICK_COPY.reauth;

/**
 * "For your security, sign in again": signing a claim needs a password
 * sign-in in the last 15 minutes (an email link never counts). The member
 * signs in again here with their account's email and password; members
 * without a password set one through the reset-password flow first.
 */
export function ReauthPrompt({
  email,
  onSignedIn,
}: {
  /** The account's sign-in email (not the claim's contact email). */
  email: string | null;
  onSignedIn: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'done'>('idle');

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
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{COPY.body}</p>
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
        <button type="submit" className="btn-primary" disabled={status === 'checking'}>
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
