'use client';

import { useState } from 'react';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SITE } from '@/lib/utils';

export function resetRedirectTo(): string {
  return `${SITE.url.replace(/\/+$/, '')}/auth/confirm?type=recovery`;
}

/** Asks Supabase to email a reset link. Always shows the same message. */
export function ForgotPasswordForm({ linkExpired = false }: { linkExpired?: boolean }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setStatus('loading');
    try {
      const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: resetRedirectTo(),
      });
      // Rate limits are the only error worth showing; never reveal whether
      // an account exists.
      if (err && err.status === 429) {
        setError('Too many requests. Wait a minute and try again.');
        setStatus('idle');
        return;
      }
      setStatus('sent');
    } catch {
      setError('Something went wrong. Check your connection and try again.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-card">
        <MailCheck className="mx-auto h-8 w-8 text-brand-700" aria-hidden />
        <h2 className="mt-3 text-lg font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-ink-muted">
          If an account uses {email.trim()}, we sent it a link to reset your password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      {linkExpired && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          That reset link has expired or was already used. Request a new one below.
        </p>
      )}
      <label htmlFor="forgot-email" className="field-label">
        Email address
      </label>
      <input
        id="forgot-email"
        type="email"
        autoComplete="email"
        className="field-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary mt-5 w-full" disabled={status === 'loading'}>
        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Email me a reset link
      </button>
    </form>
  );
}
