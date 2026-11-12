import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  SIGNUP_RESEND_COOLDOWN_MS,
  firstSignupFieldError,
  signupErrorCodeFromMessage,
  signupErrorMessage,
  signupFieldErrorCode,
  signupLooksLikeExistingEmail,
  signupPasswordHint,
  signupResendWaitSeconds,
  signupResendWaitText,
  validateSignupFields,
  type SignupErrorCode,
} from '@/lib/signup-validation';

describe('signup field validation', () => {
  it('requires name, a real-looking email, and a 10-character password', () => {
    expect(validateSignupFields({ fullName: '', email: '', password: '' })).toEqual({
      full_name: 'Enter your name.',
      email: 'Enter your email address.',
      password: 'Enter a password.',
    });
    expect(
      validateSignupFields({ fullName: 'Ada', email: 'not-an-email', password: 'short' }),
    ).toEqual({
      email: 'Enter a valid email address.',
      password: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    });
    expect(
      validateSignupFields({ fullName: 'Ada Lovelace', email: 'ada@example.com', password: 'longenough1' }),
    ).toEqual({});
  });

  it('maps field and provider messages to codes without keeping the message', () => {
    const errors = validateSignupFields({ fullName: '', email: 'x', password: '123' });
    const first = firstSignupFieldError(errors);
    expect(first?.field).toBe('full_name');
    expect(signupFieldErrorCode('email', 'Enter a valid email address.')).toBe('invalid_email');
    expect(signupFieldErrorCode('password', `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)).toBe(
      'password_too_short',
    );
    expect(signupErrorCodeFromMessage('User already registered')).toBe('email_exists');
    expect(signupErrorCodeFromMessage( 'This is taking too long. Check your connection and try again.')).toBe(
      'timeout',
    );
    expect(signupErrorCodeFromMessage('Password should be at least 6 characters')).toBe('password_rejected');
    expect(signupErrorCodeFromMessage('weird provider text')).toBe('unknown');
    expect(signupErrorCodeFromMessage('email rate limit exceeded')).toBe('rate_limited');
    expect(
      signupErrorCodeFromMessage('For security purposes, you can only request this after 54 seconds.'),
    ).toBe('rate_limited');
    expect(
      signupErrorCodeFromMessage('For security purposes, you can only request this after 12 seconds'),
    ).toBe('rate_limited');
  });
});

describe('signupLooksLikeExistingEmail', () => {
  it('detects Supabase anti-enumeration: success with an empty identities array', () => {
    expect(signupLooksLikeExistingEmail({ user: { identities: [] }, session: null })).toBe(true);
    expect(signupLooksLikeExistingEmail({ user: { identities: [{ id: 'email' }] }, session: null })).toBe(
      false,
    );
    expect(signupLooksLikeExistingEmail({ user: { identities: null }, session: null })).toBe(false);
    expect(signupLooksLikeExistingEmail({ user: {}, session: null })).toBe(false);
    expect(signupLooksLikeExistingEmail({ user: null, session: null })).toBe(false);
    expect(signupLooksLikeExistingEmail(null)).toBe(false);
  });
});

describe('signupErrorMessage', () => {
  const codes: SignupErrorCode[] = [
    'name_required',
    'email_required',
    'invalid_email',
    'password_required',
    'password_too_short',
    'email_exists',
    'password_rejected',
    'rate_limited',
    'timeout',
    'unknown',
  ];

  it('maps every signup code to a short plain sentence, never the provider text', () => {
    expect(signupErrorMessage('rate_limited')).toBe('Please wait a minute before trying again.');
    expect(signupErrorMessage('email_exists')).toBe('An account with this email already exists.');
    expect(signupErrorMessage('password_too_short')).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    );
    expect(signupErrorMessage('password_rejected')).toMatch(/at least 10 characters/i);
    expect(signupErrorMessage('timeout')).toMatch(/try again/i);
    expect(signupErrorMessage('unknown')).toMatch(/try again/i);

    for (const code of codes) {
      const message = signupErrorMessage(code);
      expect(message.length).toBeGreaterThan(8);
      expect(message.endsWith('.')).toBe(true);
      expect(message.toLowerCase()).not.toContain('rate limit exceeded');
      expect(message.toLowerCase()).not.toContain('user already registered');
      expect(message.toLowerCase()).not.toContain('over_email');
    }
  });

  it('keeps field messages in lockstep with validateSignupFields', () => {
    const errors = validateSignupFields({ fullName: '', email: '', password: '' });
    expect(errors.full_name).toBe(signupErrorMessage('name_required'));
    expect(errors.email).toBe(signupErrorMessage('email_required'));
    expect(errors.password).toBe(signupErrorMessage('password_required'));
    expect(
      validateSignupFields({ fullName: 'Ada', email: 'not-an-email', password: 'short' }).password,
    ).toBe(signupErrorMessage('password_too_short'));
  });
});

describe('signup password hint and resend wait', () => {
  it('counts how many more characters are needed while the password is under 10', () => {
    expect(signupPasswordHint(0)).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(signupPasswordHint(1)).toBe('9 more characters needed');
    expect(signupPasswordHint(9)).toBe('1 more character needed');
    expect(signupPasswordHint(10)).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  });

  it('counts the confirmation-email cooldown in whole seconds', () => {
    expect(SIGNUP_RESEND_COOLDOWN_MS).toBe(60_000);
    expect(signupResendWaitSeconds(1_000, 1_000)).toBe(0);
    expect(signupResendWaitSeconds(61_000, 1_000)).toBe(60);
    expect(signupResendWaitText(0)).toBe('');
    expect(signupResendWaitText(1)).toBe('You can resend in 1 second.');
    expect(signupResendWaitText(45)).toBe('You can resend in 45 seconds.');
  });
});
