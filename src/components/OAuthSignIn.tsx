'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { OAUTH_COPY } from '@/lib/copy';
import {
  OAUTH_FAILED_PARAM,
  OAUTH_FAILED_PROVIDER_PARAM,
  OAUTH_FAILED_VALUE,
  oauthProviderFromParam,
  oauthProviderOptions,
  oauthRedirectTo,
  type OAuthProvider,
} from '@/lib/oauth';
import { PENDING_NEXT_COOKIE, pendingNextCookie } from '@/lib/safe-next';
import { rememberSignupContext } from '@/lib/signup-context';
import { signupErrorCodeFromMessage, signupErrorMessage } from '@/lib/signup-validation';
import { createClient } from '@/lib/supabase/client';

/** Google's "G" mark, the only brand asset Google asks sign-in buttons to show. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/** The Apple logo in white, as Apple's sign-in button guidelines show it on the black style. */
export function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"
      />
    </svg>
  );
}

/**
 * Starts a Google or Apple sign-in through Supabase Auth and leaves the page.
 * Resolves with an error message (already mapped, never Supabase's raw text)
 * when it could not start; otherwise the browser is on its way to the provider.
 */
export async function startOAuthSignIn(args: {
  provider: OAuthProvider;
  next: string | null;
  /** Prefill Google's account chooser (the sign-in-again prompt passes the account email). Apple ignores it. */
  loginHint?: string | null;
}): Promise<{ error: string; code: string } | null> {
  try {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: args.provider,
      options: {
        redirectTo: oauthRedirectTo(window.location.origin, args.next, args.provider),
        ...oauthProviderOptions(args.provider, args.loginHint),
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
 * On /signup, keeps ?next the way the email form does before leaving: the
 * claim context and the pending-next cookie (cleared when there is no next).
 * /login leaves both alone; its next travels in redirectTo.
 */
export function rememberBeforeOAuth(mode: 'login' | 'signup', next: string | null): void {
  if (mode !== 'signup') return;
  rememberSignupContext(next);
  document.cookie = next
    ? pendingNextCookie(next, window.location.protocol === 'https:')
    : `${PENDING_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** The sign-in-again prompt's request: back to this same page, for this account. */
export function oauthReauthRequest(
  location: { pathname: string; search: string },
  email: string | null,
): { next: string; loginHint: string | null } {
  return { next: `${location.pathname}${location.search}`, loginHint: email };
}

const LABEL: Record<OAuthProvider, { idle: string; working: string }> = {
  google: { idle: OAUTH_COPY.google, working: OAUTH_COPY.working },
  apple: { idle: OAUTH_COPY.apple, working: OAUTH_COPY.appleWorking },
};

/**
 * Google: the secondary (white) button with the G mark. Apple: Apple's black
 * style with the white Apple logo, the system font and "Continue with
 * Apple", per Apple's Human Interface Guidelines for sign-in buttons.
 */
const BUTTON_CLASS: Record<OAuthProvider, string> = {
  google: 'btn-secondary w-full',
  apple:
    'btn w-full bg-black text-white hover:bg-neutral-800 active:bg-neutral-900 [font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif]',
};

function agreeLead(providers: readonly OAuthProvider[]): string {
  const google = providers.includes('google');
  const apple = providers.includes('apple');
  if (google && apple) return OAUTH_COPY.agreeLeadBoth;
  return apple ? OAUTH_COPY.agreeLeadApple : OAUTH_COPY.agreeLead;
}

/**
 * "Continue with Google" and/or "Continue with Apple" on /login and /signup
 * (OAUTH_SIGN_IN_ENABLED and APPLE_SIGN_IN_ENABLED; the page decides which).
 * Keeps ?next the way the email form does: the safe path goes to
 * /auth/callback, and on sign-up the pending-next cookie and the claim
 * context are saved too. On /login, where a new person can also create an
 * account this way, it shows the same Terms and Privacy agreement the
 * sign-up page shows, before the redirect.
 */
export function OAuthSignInButtons({
  mode,
  next,
  providers,
}: {
  mode: 'login' | 'signup';
  next: string | null;
  providers: readonly OAuthProvider[];
}) {
  const posthog = usePostHog();
  const searchParams = useSearchParams();
  const cameBackFailed = searchParams.get(OAUTH_FAILED_PARAM) === OAUTH_FAILED_VALUE;
  const failedProvider = oauthProviderFromParam(searchParams.get(OAUTH_FAILED_PROVIDER_PARAM));
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState('');

  async function onClick(provider: OAuthProvider) {
    if (loading) return;
    setError('');
    setLoading(provider);
    // Provider and form only: no email, name or other PII.
    posthog?.capture('oauth_started', { provider, form: mode });
    rememberBeforeOAuth(mode, next);
    const failed = await startOAuthSignIn({ provider, next });
    if (failed) {
      posthog?.capture('oauth_error', { provider, form: mode, code: failed.code });
      setError(failed.error);
      setLoading(null);
    }
  }

  if (providers.length === 0) return null;
  const shown =
    error || (cameBackFailed ? (failedProvider === 'apple' ? OAUTH_COPY.appleFailed : OAUTH_COPY.failed) : '');
  return (
    <div className="space-y-3">
      {shown && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{shown}</span>
        </div>
      )}
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void onClick(provider)}
          disabled={loading !== null}
          aria-busy={loading === provider}
          className={BUTTON_CLASS[provider]}
          data-oauth-provider={provider}
        >
          {loading === provider ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : provider === 'apple' ? (
            <AppleMark />
          ) : (
            <GoogleMark />
          )}
          {loading === provider ? LABEL[provider].working : LABEL[provider].idle}
        </button>
      ))}
      {mode === 'login' && (
        <p className="text-xs leading-relaxed text-ink-muted">
          {agreeLead(providers)}{' '}
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
