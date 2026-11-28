'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { OAuthSignInButtons } from './OAuthSignIn';
import { PENDING_NEXT_COOKIE, onboardingPath, pendingNextCookie, safeNextPath } from '@/lib/safe-next';
import { rememberSignupContext } from '@/lib/signup-context';
import { OAUTH_COPY } from '@/lib/copy';
import {
  MIN_PASSWORD_LENGTH,
  SIGNUP_RESEND_COOLDOWN_MS,
  SIGNUP_RESEND_SENT,
  firstSignupFieldError,
  signupErrorCodeFromMessage,
  signupErrorMessage,
  signupFieldErrorCode,
  signupLooksLikeExistingEmail,
  signupPasswordHint,
  signupResendWaitSeconds,
  signupResendWaitText,
  validateMagicLinkFields,
  validateSignupFields,
  type SignupErrorCode,
  type SignupField,
  type SignupFieldErrors,
} from '@/lib/signup-validation';
import { SITE } from '@/lib/utils';
import {
  attributionMetadata,
  attributionPersonProperties,
  attributionQuery,
  firstTouch,
  parseAttribution,
  readBrowserCookies,
  writeBrowserCookies,
} from '@/lib/attribution';

type Mode = 'login' | 'signup';

/** Don't leave the button spinning if Supabase or the next page hangs. */
const AUTH_TIMEOUT_MS = 12_000;
const AUTH_TIMEOUT_MESSAGE = 'This is taking too long. Check your connection and try again.';

function emailRedirectTo(next?: string | null): string {
  const callback = `${SITE.url.replace(/\/+$/, '')}/auth/callback`;
  return next ? `${callback}?${new URLSearchParams({ next })}` : callback;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Shared email/password authentication card used by /login and /signup.
 * Uses the browser Supabase client. Reads ?next to send users back where they
 * came from after logging in. Must be rendered inside <Suspense> because it
 * calls useSearchParams(). `switchPrompt={false}` leaves out the "New to
 * Lawsuit AI? / Already have an account?" line, for a page that offers the
 * other form itself. `oauth` (OAUTH_SIGN_IN_ENABLED, read by the page) adds
 * "Continue with Google" above the email form, and `apple`
 * (APPLE_SIGN_IN_ENABLED) adds "Continue with Apple".
 */
export function AuthForm({
  mode,
  switchPrompt = true,
  storeNote,
  oauth = false,
  apple = false,
}: {
  mode: Mode;
  switchPrompt?: boolean;
  storeNote?: string;
  oauth?: boolean;
  apple?: boolean;
}) {
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

  // First-touch UTMs + ref from ?utm_* / ?ref (set by /r/[code]) or cookies.
  const attr = firstTouch(readBrowserCookies(), parseAttribution(searchParams));

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'check-email'>('idle');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<SignupErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending'>('idle');
  const [resendFeedback, setResendFeedback] = useState('');
  const [resendError, setResendError] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [resendNow, setResendNow] = useState(() => Date.now());
  const [alertsOptIn, setAlertsOptIn] = useState(false);
  // Signup and confirmed-email recovery may involve accounts without a password.
  const [passwordMode, setPasswordMode] = useState(() => mode === 'login' && !confirmed);

  const isSignup = mode === 'signup';
  const switchParams = attributionQuery(attr);
  if (next) switchParams.set('next', next);
  const switchQuery = switchParams.toString();
  const switchHref = `${isSignup ? '/login' : '/signup'}${switchQuery ? `?${switchQuery}` : ''}`;

  const resendWait = signupResendWaitSeconds(cooldownUntil, resendNow);

  useEffect(() => {
    if (!cooldownUntil) return;
    function tick() {
      const now = Date.now();
      setResendNow(now);
      if (signupResendWaitSeconds(cooldownUntil, now) <= 0) {
        setCooldownUntil(0);
      }
    }
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function captureSignupError(code: string) {
    posthog?.capture('signup_error', { code });
  }

  function showSignupError(code: SignupErrorCode) {
    captureSignupError(code);
    setErrorCode(code);
    setError(signupErrorMessage(code));
  }

  function backToSignupForm() {
    setStatus('idle');
    setError('');
    setErrorCode(null);
    setFieldErrors({});
    setResendFeedback('');
    setResendError(false);
    setResendStatus('idle');
    setCooldownUntil(0);
  }

  function sendSignInLink() {
    return createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: isSignup,
        emailRedirectTo: emailRedirectTo(isSignup ? null : next),
        data: isSignup ? { full_name: fullName, email_opt_in: alertsOptIn, ...attributionMetadata(attr) } : undefined,
      },
    });
  }

  async function resendConfirmation() {
    if (resendStatus === 'sending' || resendWait > 0) return;
    setResendStatus('sending');
    setResendFeedback('');
    setResendError(false);
    try {
      const { error: resendErr } = await withTimeout(
        passwordMode
          ? createClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: emailRedirectTo() } })
          : sendSignInLink(),
        AUTH_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE,
      );
      if (resendErr) {
        setResendError(true);
        setResendFeedback(signupErrorMessage(signupErrorCodeFromMessage(resendErr.message)));
      } else {
        setResendFeedback(SIGNUP_RESEND_SENT);
      }
    } catch (err) {
      const timeout = err instanceof Error && err.message === AUTH_TIMEOUT_MESSAGE;
      setResendError(true);
      setResendFeedback(signupErrorMessage(timeout ? 'timeout' : 'unknown'));
    }
    setResendStatus('idle');
    setCooldownUntil(Date.now() + SIGNUP_RESEND_COOLDOWN_MS);
    setResendNow(Date.now());
  }

  function identifyOnly(userId: string) {
    writeBrowserCookies(attr);
    // The account id only: no email, name or other PII in analytics.
    posthog?.identify(userId);
    const once = attributionPersonProperties(attr);
    if (Object.keys(once).length > 0) posthog?.setPersonProperties({}, once);
    void fetch('/api/session-flags', { method: 'POST' })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((json: { internal?: boolean } | null) => {
        if (json?.internal) {
          posthog?.identify(userId, { internal: true, cm_traffic_kind: 'internal' });
          posthog?.register({ cm_traffic_kind: 'internal' });
        }
      })
      .catch(() => undefined);
  }

  function describedBy(field: SignupField, extra?: string) {
    return [extra, fieldErrors[field] ? `${field}-error` : null].filter(Boolean).join(' ') || undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setErrorCode(null);
    setFieldErrors({});

    if (isSignup) {
      const nextErrors = passwordMode
        ? validateSignupFields({ fullName, email, password })
        : validateMagicLinkFields({ fullName, email });
      const first = firstSignupFieldError(nextErrors);
      if (first) {
        setFieldErrors(nextErrors);
        setError(first.message);
        captureSignupError(signupFieldErrorCode(first.field, first.message));
        document.getElementById(first.field === 'full_name' ? 'full_name' : first.field)?.focus();
        return;
      }
    } else if (!passwordMode) {
      const trimmed = email.trim();
      if (!trimmed) {
        setFieldErrors({ email: 'Enter your email address.' });
        setError('Enter your email address.');
        document.getElementById('email')?.focus();
        return;
      }
    }

    setStatus('loading');
    if (isSignup) {
      rememberSignupContext(next);
      posthog?.capture('signup_submitted');
    }

    try {
      if (!passwordMode) {
        if (isSignup) {
          document.cookie = next
            ? pendingNextCookie(next, window.location.protocol === 'https:')
            : `${PENDING_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
        }
        const { error: otpError } = await withTimeout(sendSignInLink(), AUTH_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE);
        if (otpError) {
          if (isSignup) showSignupError(signupErrorCodeFromMessage(otpError.message));
          else setError(signupErrorMessage(signupErrorCodeFromMessage(otpError.message)));
          setStatus('idle');
          return;
        }
        setStatus('check-email');
        return;
      }

      const supabase = createClient();
      if (isSignup) {
        // The confirmation link opens /auth/callback, which then goes to
        // onboarding; this cookie (on this device) brings the person back to
        // the page they started from, such as the claim they picked.
        document.cookie = next
          ? pendingNextCookie(next, window.location.protocol === 'https:')
          : `${PENDING_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
        const { data, error: signUpError } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                email_opt_in: alertsOptIn,
                ...attributionMetadata(attr),
              },
              // Site URL (lawsuitai.org in prod), not this tab's origin, so the
              // confirmation link always hits /auth/callback on the live site.
              emailRedirectTo: emailRedirectTo(),
            },
          }),
          AUTH_TIMEOUT_MS,
          AUTH_TIMEOUT_MESSAGE,
        );

        if (signUpError) {
          showSignupError(signupErrorCodeFromMessage(signUpError.message));
          setStatus('idle');
          return;
        }

        // Anti-enumeration: existing email is success with identities: [].
        if (signupLooksLikeExistingEmail(data)) {
          showSignupError('email_exists');
          setStatus('idle');
          return;
        }

        // Session present → email confirmation is disabled, go straight in.
        if (data.session) {
          identifyOnly(data.session.user.id);
          posthog?.capture('signup_completed', { evidence: 'session_after_signup' }, { send_instantly: true });
          // Leave this page immediately so the spinner cannot sit on a slow RSC.
          window.location.assign(onboardingPath(next));
          return;
        }

        // No session → a confirmation email was sent.
        setStatus('check-email');
        return;
      }

      // Login. signInWithPassword already returns the user; do not wait on
      // another getUser or a server refresh of the destination page.
      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE,
      );

      if (signInError) {
        setError(signInError.message);
        setStatus('idle');
        return;
      }

      if (data.user) {
        identifyOnly(data.user.id);
        posthog?.capture('login_completed', { evidence: 'password_sign_in' }, { send_instantly: true });
      }

      window.location.assign(next || '/dashboard');
    } catch (err) {
      const timeout = err instanceof Error && err.message === AUTH_TIMEOUT_MESSAGE;
      if (isSignup) {
        showSignupError(timeout ? 'timeout' : 'unknown');
      } else {
        setError(timeout ? AUTH_TIMEOUT_MESSAGE : 'Something went wrong. Please try again.');
      }
      setStatus('idle');
    }
  }

  if (status === 'check-email') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-success-50 text-success-600">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {!passwordMode ? (
            <>Open the sign-in link we sent to <span className="font-semibold text-ink">{email.trim()}</span>.</>
          ) : (
            <>
              We sent a confirmation link to{' '}
              <span className="font-semibold text-ink">{email}</span>. Click it to
              verify your account and finish setting up your profile.
            </>
          )}
        </p>
        {isSignup && <p className="mt-2 text-sm text-ink-muted">{OAUTH_COPY.confirmReminder}</p>}
        {next && (
          <p className="mt-2 text-sm text-ink-muted">
            Open the link on this device and we&rsquo;ll bring you back to{' '}
            {toClaim ? 'the settlement you picked' : 'where you were'}.
          </p>
        )}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={resendStatus === 'sending' || resendWait > 0}
            onClick={() => void resendConfirmation()}
            className="btn-secondary w-full"
          >
            {resendStatus === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              passwordMode ? 'Resend confirmation email' : 'Resend sign-in link'
            )}
          </button>
          {resendWait > 0 && (
            <p className="text-xs text-ink-muted">{signupResendWaitText(resendWait)}</p>
          )}
          {resendFeedback && (
            <p
              role={resendError ? 'alert' : 'status'}
              className={`text-sm ${resendError ? 'text-danger-700' : 'text-success-700'}`}
            >
              {resendFeedback}
            </p>
          )}
        </div>
        <p className="mt-4 text-sm text-ink-muted">Didn’t get it? Check your spam folder.</p>
        <button type="button" onClick={backToSignupForm} className="btn-secondary mt-2 w-full">
          Try a different email
        </button>
      </div>
    );
  }

  const loading = status === 'loading';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      {(oauth || apple) && (
        <div className="mb-4">
          <OAuthSignInButtons
            mode={mode}
            next={next}
            providers={[...(apple ? (['apple'] as const) : []), ...(oauth ? (['google'] as const) : [])]}
          />
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-busy={loading}>
        {!isSignup && confirmed && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {passwordMode
                ? 'Your email is confirmed. Log in to continue'
                : 'Your email is confirmed. Request a new sign-in link to continue'}
              {toClaim ? ' to your claim' : ''}.
            </span>
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
              confirmed your email, log in below. If not, resend the confirmation email
              instead of creating the account again.
            </span>
          </div>
        )}
        <div aria-live="polite" className={error ? '' : 'min-h-0'}>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {isSignup && errorCode === 'email_exists' ? (
                <span>
                  {error}{' '}
                  <Link href={switchHref} className="text-link">
                    Log in
                  </Link>
                  {' or '}
                  <Link href="/forgot-password" className="text-link">
                    reset your password
                  </Link>
                  .
                </span>
              ) : (
                <span>{error}</span>
              )}
            </div>
          )}
        </div>

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
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.full_name) {
                    setFieldErrors((prev) => ({ ...prev, full_name: undefined }));
                  }
                }}
                placeholder="Jane Doe"
                className="field-input pl-10"
                aria-invalid={fieldErrors.full_name ? true : undefined}
                aria-describedby={describedBy('full_name')}
              />
            </div>
            {fieldErrors.full_name && (
              <p id="full_name-error" className="mt-1.5 text-xs text-danger-700">
                {fieldErrors.full_name}
              </p>
            )}
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
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              placeholder="you@email.com"
              className="field-input pl-10"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={describedBy('email')}
            />
          </div>
          {fieldErrors.email && (
            <p id="email-error" className="mt-1.5 text-xs text-danger-700">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {passwordMode ? (
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
              onChange={(e) => {
                setPassword(e.target.value);
                // While typing, the muted #password-hint below is the only
                // feedback. Turning the same sentence red on keystroke 1 made a
                // normal password look rejected, so the error waits for blur
                // (and for submit, via validateSignupFields).
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              onBlur={() => {
                if (!isSignup || password.length === 0) return;
                if (password.length < MIN_PASSWORD_LENGTH) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    password: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
                  }));
                }
              }}
              placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
              className="field-input pl-10"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={describedBy('password', isSignup ? 'password-hint' : undefined)}
            />
          </div>
          {isSignup && (
            <p id="password-hint" className="mt-1.5 text-xs text-ink-muted">
              {signupPasswordHint(password.length)}
            </p>
          )}
          {fieldErrors.password && (
            <p id="password-error" className="mt-1.5 text-xs text-danger-700">
              {fieldErrors.password}
            </p>
          )}
        </div>
        ) : (
          <p className="text-sm text-ink-muted">
            {isSignup ? OAUTH_COPY.magicLinkHint : 'No password needed. Use the email address on your account.'}
          </p>
        )}

        {isSignup && (
          <label className="flex items-start gap-2.5 text-sm text-ink-muted">
            <input
              id="alerts-opt-in"
              name="email_opt_in"
              type="checkbox"
              checked={alertsOptIn}
              onChange={(e) => setAlertsOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
            />
            <span>
              Email me when a new settlement may match (optional). Off unless you check this.
              You can unsubscribe anytime. We never email health answers.
            </span>
          </label>
        )}

        {isSignup && storeNote && (
          <p className="text-xs leading-relaxed text-ink-muted">{storeNote}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {isSignup
                ? passwordMode
                  ? 'Creating your account…'
                  : OAUTH_COPY.magicLinkWorking
                : passwordMode
                  ? 'Signing in…'
                  : OAUTH_COPY.magicLinkWorking}
            </>
          ) : (
            <>
              {isSignup
                ? passwordMode
                  ? 'Create my account'
                  : OAUTH_COPY.magicLink
                : passwordMode
                  ? 'Log in'
                  : OAUTH_COPY.magicLink}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setPasswordMode((on) => !on);
            setError('');
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          className={isSignup ? 'text-link text-sm' : 'btn-secondary w-full'}
        >
          {passwordMode
            ? isSignup
              ? OAUTH_COPY.passwordOptionHide
              : OAUTH_COPY.magicLink
            : isSignup
              ? OAUTH_COPY.passwordOption
              : 'Use a password instead'}
        </button>
        {!isSignup && passwordMode && (
          <Link href="/forgot-password" className="btn-secondary w-full">
            Forgot password?
          </Link>
        )}
      </form>

      {switchPrompt && (
        <p className="mt-5 text-center text-sm text-ink-muted">
          {isSignup ? 'Already have an account?' : 'New to Lawsuit AI?'}{' '}
          <Link
            href={switchHref}
            className="text-link"
          >
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      )}
    </div>
  );
}
