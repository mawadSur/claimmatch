/**
 * Client-side signup checks. AuthForm has noValidate so the browser will not
 * show native tooltips; these messages have to appear before the request
 * goes to Supabase or the submit button sits in a spinner with no reason.
 */

export const MIN_PASSWORD_LENGTH = 10;

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
  if (m.includes('invalid') && m.includes('email')) return 'invalid_email';
  if (m.includes('password')) return 'password_rejected';
  return 'unknown';
}
