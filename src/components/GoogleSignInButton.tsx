'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { OAUTH_COPY } from '@/lib/copy';
import { OAUTH_FAILED_PARAM, OAUTH_FAILED_VALUE, OAUTH_PROVIDER, oauthRedirectTo } from '@/lib/oauth';
import { PENDING_NEXT_COOKIE, pendingNextCookie } from '@/lib/safe-next';
import { rememberSignupContext } from '@/lib/signup-context';
import { signupErrorCodeFromMessage, signupErrorMessage } from '@/lib/signup-validation';
import { createClient } from '@/lib/supabase/client';

/** Google's "G" mark, the only brand asset Google asks sign-in buttons to show. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Starts a Google sign-in through Supabase Auth and leaves the page. Resolves
 * with an error message (already mapped, never Supabase's raw text) when it
 * could not start; otherwise the browser is on its way to Google.
 */
export async function startGoogleSignIn(args: {
  next: string | null;
  /** Prefill Google's account chooser (the sign-in-again prompt passes the account email). */
  loginHint?: string | null;
}): Promise<{ error: string; code: string } | null> {
  try {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: OAUTH_PROVIDER,
      options: {
        redirectTo: oauthRedirectTo(window.location.origin, args.next),
        // Always show Google's chooser, so a shared computer can't silently
        // sign in as whoever used Google last.
        queryParams: args.loginHint
          ? { prompt: 'select_account', login_hint: args.loginHint }
          : { prompt: 'select_account' },
      },
    });
    if (error) {
      const code = signupErrorCodeFromMessage(error.message);
      return { error: signupErrorMessage(code), code };
    }
    return null;
  } catch {
    return { error: signupErrorMessage('unknown'), code: 'unknown' };
  }
}

/**
 * "Continue with Google" on /login and /signup (OAUTH_SIGN_IN_ENABLED; the
 * page decides whether to render it). Keeps ?next the way the email form
 * does: the safe path goes to /auth/callback, and on sign-up the pending-next
 * cookie and the claim context are saved too. On /login, where a new person
 * can also create an account this way, it shows the same Terms and Privacy
 * agreement the sign-up page shows, before the redirect.
 */
export function GoogleSignInButton({ mode, next }: { mode: 'login' | 'signup'; next: string | null }) {
  const posthog = usePostHog();
  const searchParams = useSearchParams();
  const cameBackFailed = searchParams.get(OAUTH_FAILED_PARAM) === OAUTH_FAILED_VALUE;
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState('');

  async function onClick() {
    if (status === 'loading') return;
    setError('');
    setStatus('loading');
    // Provider and form only: no email, name or other PII.
    posthog?.capture('oauth_started', { provider: OAUTH_PROVIDER, form: mode });
    if (mode === 'signup') {
      rememberSignupContext(next);
      document.cookie = next
        ? pendingNextCookie(next, window.location.protocol === 'https:')
        : `${PENDING_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
    const failed = await startGoogleSignIn({ next });
    if (failed) {
      posthog?.capture('oauth_error', { provider: OAUTH_PROVIDER, form: mode, code: failed.code });
      setError(failed.error);
      setStatus('idle');
    }
  }

  const shown = error || (cameBackFailed ? OAUTH_COPY.failed : '');
  return (
    <div className="space-y-3">
      {shown && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{shown}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={status === 'loading'}
        aria-busy={status === 'loading'}
        className="btn-secondary w-full"
        data-oauth-provider={OAUTH_PROVIDER}
      >
        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleMark />}
        {status === 'loading' ? OAUTH_COPY.working : OAUTH_COPY.google}
      </button>
      {mode === 'login' && (
        <p className="text-xs leading-relaxed text-ink-muted">
          {OAUTH_COPY.agreeLead}{' '}
          <Link href="/terms" className="text-link">
            {OAUTH_COPY.terms}
          </Link>{' '}
          {OAUTH_COPY.and}{' '}
          <Link href="/privacy" className="text-link">
            {OAUTH_COPY.privacy}
          </Link>
          .
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-soft" aria-hidden>
        <span className="h-px flex-1 bg-slate-200" />
        {OAUTH_COPY.divider}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
