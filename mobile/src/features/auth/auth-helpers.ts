import {
  signupErrorCodeFromMessage,
  signupErrorMessage,
  type SignupErrorCode,
} from '@shared/lib/signup-validation';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { getApi } from '@/lib/api';

/** D44: new passwords are at least 10 characters (src/components/AuthForm.tsx; set the same in Supabase Auth). */
export const MIN_PASSWORD_LENGTH = 10;

/** Don't leave the button spinning if Supabase hangs (src/components/AuthForm.tsx). */
export const AUTH_TIMEOUT_MS = 12_000;

/** Thrown by withTimeout when Supabase Auth has not answered in time. */
export class AuthTimeoutError extends Error {
  constructor() {
    super(auth.timeout.text);
    this.name = 'AuthTimeoutError';
  }
}

/** Rejects with AuthTimeoutError when `promise` takes longer than `ms`. The timer never outlives the call. */
export function withTimeout<T>(promise: Promise<T>, ms: number = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * An error Supabase Auth returned, as the form shows it: its own message, as
 * on the web, except that a request that never reached Supabase shows the
 * app's network message instead of the platform's ("Network request failed").
 */
export function authErrorText(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return common.networkError.text;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return common.genericError.text;
}

/** A call that threw: the timeout message, or the generic one (src/components/AuthForm.tsx). */
export function thrownAuthErrorText(error: unknown): string {
  return error instanceof AuthTimeoutError ? auth.timeout.text : common.genericError.text;
}

function providerMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

/**
 * Sign-up errors as AuthForm shows them: a mapped sentence, never the raw
 * provider text. A request that never reached Supabase still uses the app's
 * network line.
 */
export function signupAuthError(error: unknown): { code: SignupErrorCode; message: string } {
  if (error instanceof AuthTimeoutError) {
    return { code: 'timeout', message: signupErrorMessage('timeout') };
  }
  if (isAuthRetryableFetchError(error)) {
    return { code: 'unknown', message: common.networkError.text };
  }
  const raw = providerMessage(error);
  if (raw) {
    const code = signupErrorCodeFromMessage(raw);
    return { code, message: signupErrorMessage(code) };
  }
  return { code: 'unknown', message: signupErrorMessage('unknown') };
}

/** The shape the web's forgot-password form checks before sending (src/components/auth/ForgotPasswordForm.tsx). */
export function isEmailShaped(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/**
 * POST /api/session-flags after a sign-in: marks internal testers on the
 * profile, as the web does. Fire and forget: the answer is not needed, and the
 * request never rejects.
 */
export function markSessionFlags(): void {
  void getApi().request('/api/session-flags', { method: 'POST' });
}
