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
  CheckCircle2,
} from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { createClient } from '@/lib/supabase/client';
import { PENDING_NEXT_COOKIE, onboardingPath, pendingNextCookie, safeNextPath } from '@/lib/safe-next';

type Mode = 'login' | 'signup';

/** D44: new passwords are at least 10 characters (set the same in Supabase Auth). */
const MIN_PASSWORD_LENGTH = 10;

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
  // Only a path on this site (no "//host", "/\host" or control characters), so
  // a crafted link can't send people to another site after they log in.
  const next = safeNextPath(searchParams.get('next'));
  // Set by /auth/callback when the confirmation link could not sign the person
  // in here (opened in another browser, or used twice), or had expired.
  const confirmed = searchParams.get('confirmed') === '1';
  const linkExpired = searchParams.get('link') === 'expired';
  const toClaim = next?.startsWith('/claim/') ?? false;

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
    // The form has noValidate, so check the new password's length here.
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    setStatus('loading');

    const supabase = createClient();

    try {
      if (isSignup) {
        // The confirmation link opens /auth/callback, which then goes to
        // onboarding; this cookie (on this device) brings the person back to
        // the page they started from, such as the claim they picked.
        document.cookie = next
          ? pendingNextCookie(next, window.location.protocol === 'https:')
          : `${PENDING_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
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
          // The account id only: no email, name or other PII in analytics.
          posthog?.identify(data.session.user.id);
          posthog?.capture('signup_completed');
          // Onboarding returns people to where they started (for example the
          // claim page they were on) when given ?next.
          router.push(onboardingPath(next));
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
        posthog?.identify(userData.user.id);
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
        {next && (
          <p className="mt-2 text-sm text-ink-muted">
            Open the link on this device and we&rsquo;ll bring you back to{' '}
            {toClaim ? 'the settlement you picked' : 'where you were'}.
          </p>
        )}
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
        {!isSignup && confirmed && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Your email is confirmed. Log in to continue{toClaim ? ' to your claim' : ''}.</span>
          </div>
        )}
        {!isSignup && linkExpired && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              That confirmation link has expired or was already used. If you already
              confirmed your email, log in below. If not, create your account again with
              the same email to get a new link.
            </span>
          </div>
        )}
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
              minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
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
