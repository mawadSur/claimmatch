'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  User,
  Loader2,
  ArrowRight,
  AlertCircle,
  MailCheck,
} from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'signup';

/**
 * Shared email/password authentication card used by /login and /signup.
 * Uses the browser Supabase client. Reads ?next to send users back where they
 * came from after logging in. Must be rendered inside <Suspense> because it
 * calls useSearchParams().
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const rawNext = searchParams.get('next');
  // Only allow same-origin relative paths — never a protocol-relative ("//host")
  // or absolute URL — to prevent an open redirect after authentication.
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : null;

  // Referral code from ?ref (set by /r/[code]) or the cm_ref cookie fallback.
  function readRefCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(/(?:^|;\s*)cm_ref=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  const rawRef = searchParams.get('ref') || readRefCookie();
  const ref = rawRef ? rawRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || null : null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'check-email'>('idle');
  const [error, setError] = useState('');

  const isSignup = mode === 'signup';
  const switchHref = `${isSignup ? '/login' : '/signup'}${
    next ? `?next=${encodeURIComponent(next)}` : ''
  }`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('loading');

    const supabase = createClient();

    try {
      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, ...(ref ? { ref } : {}) },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          setStatus('idle');
          return;
        }

        // Session present → email confirmation is disabled, go straight in.
        if (data.session) {
          posthog?.identify(data.session.user.id, {
            email: data.session.user.email,
            name: fullName,
          });
          posthog?.capture('signup_completed');
          router.push('/onboarding');
          router.refresh();
          return;
        }

        // No session → a confirmation email was sent.
        setStatus('check-email');
        return;
      }

      // Login
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setStatus('idle');
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        posthog?.identify(userData.user.id, {
          email: userData.user.email,
        });
        posthog?.capture('login_completed');
      }

      router.push(next || '/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'check-email') {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-success-50 text-success-600">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-ink-muted">
          We sent a confirmation link to{' '}
          <span className="font-semibold text-ink">{email}</span>. Click it to
          verify your account and finish setting up your profile.
        </p>
        <p className="mt-4 text-xs text-ink-soft">
          Didn’t get it? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setError('');
            }}
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            try a different email
          </button>
          .
        </p>
      </div>
    );
  }

  const loading = status === 'loading';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isSignup && (
          <div>
            <label htmlFor="full_name" className="field-label">
              Full name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="field-input pl-10"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="field-input pl-10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={isSignup ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? 'At least 6 characters' : 'Your password'}
              className="field-input pl-10"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {isSignup ? 'Create my account' : 'Log in'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {isSignup ? 'Already have an account?' : 'New to ClaimMatch?'}{' '}
        <Link
          href={switchHref}
          className="font-semibold text-brand-700 hover:text-brand-800"
        >
          {isSignup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
