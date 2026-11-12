/**
 * Client-side signup checks. AuthForm has noValidate so the browser will not
 * show native tooltips; these messages have to appear before the request
 * goes to Supabase or the submit button sits in a spinner with no reason.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** How long the check-your-email screen waits before another confirmation email. */
export const SIGNUP_RESEND_COOLDOWN_MS = 60_000;

export const SIGNUP_RESEND_SENT = 'We sent another confirmation email. Check your inbox.';

export type SignupField = 'full_name' | 'email' | 'password';

export type SignupFieldErrors = Partial<Record<SignupField, string>>;

/** Codes only — never an email, name, or raw provider message. */
export type SignupErrorCode =
  | 'name_required'
  | 'email_required'
  | 'invalid_email'
  | 'password_required'
  | 'password_too_short'
  | 'email_exists'
  | 'password_rejected'
  | 'rate_limited'
  | 'timeout'
  | 'unknown';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignupFields(input: {
  fullName: string;
  email: string;
  password: string;
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (!input.fullName.trim()) {
    errors.full_name = 'Enter your name.';
  }
  const email = input.email.trim();
  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_SHAPE.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!input.password) {
    errors.password = 'Enter a password.';
  } else if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  return errors;
}

export function signupFieldErrorCode(field: SignupField, message: string): SignupErrorCode {
  if (field === 'full_name') return 'name_required';
  if (field === 'email') {
    return message.toLowerCase().includes('valid') ? 'invalid_email' : 'email_required';
  }
  return message.toLowerCase().includes('least') ? 'password_too_short' : 'password_required';
}

export function firstSignupFieldError(
  errors: SignupFieldErrors,
): { field: SignupField; message: string } | null {
  for (const field of ['full_name', 'email', 'password'] as const) {
    const message = errors[field];
    if (message) return { field, message };
  }
  return null;
}

/** Map a provider or timeout message to a code. The message itself is not sent. */
export function signupErrorCodeFromMessage(message: string): SignupErrorCode {
  const m = message.toLowerCase();
  if (m.includes('taking too long')) return 'timeout';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'email_exists';
  }
  if (m.includes('rate') && (m.includes('limit') || m.includes('too many'))) return 'rate_limited';
  // Supabase 429 copy, e.g. "For security purposes, you can only request this after 54 seconds."
  if (m.includes('for security purposes') && m.includes('after') && m.includes('second')) {
    return 'rate_limited';
  }
  if (m.includes('invalid') && m.includes('email')) return 'invalid_email';
  if (m.includes('password')) return 'password_rejected';
  return 'unknown';
}

const SIGNUP_ERROR_MESSAGES: Record<SignupErrorCode, string> = {
  name_required: 'Enter your name.',
  email_required: 'Enter your email address.',
  invalid_email: 'Enter a valid email address.',
  password_required: 'Enter a password.',
  password_too_short: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
  email_exists: 'An account with this email already exists.',
  password_rejected: `That password wasn't accepted. Try a different one with at least ${MIN_PASSWORD_LENGTH} characters.`,
  rate_limited: 'Please wait a minute before trying again.',
  timeout: 'This is taking too long. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Plain text for a signup error code. Never a raw provider message. */
export function signupErrorMessage(code: SignupErrorCode): string {
  return SIGNUP_ERROR_MESSAGES[code];
}

/**
 * Supabase anti-enumeration: signing up with an already-registered email
 * returns success, no error, and a user whose identities array is empty.
 */
export function signupLooksLikeExistingEmail(
  data:
    | { user?: { identities?: unknown[] | null } | null; session?: unknown }
    | null
    | undefined,
): boolean {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

/** Live password hint under the signup field. */
export function signupPasswordHint(length: number): string {
  if (length > 0 && length < MIN_PASSWORD_LENGTH) {
    const needed = MIN_PASSWORD_LENGTH - length;
    return `${needed} more character${needed === 1 ? '' : 's'} needed`;
  }
  return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

/** Seconds left on the confirmation-email cooldown, never below zero. */
export function signupResendWaitSeconds(cooldownUntil: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
}

export function signupResendWaitText(seconds: number): string {
  if (seconds <= 0) return '';
  return seconds === 1 ? 'You can resend in 1 second.' : `You can resend in ${seconds} seconds.`;
}
