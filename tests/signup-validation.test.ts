import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  firstSignupFieldError,
  signupErrorCodeFromMessage,
  signupFieldErrorCode,
  validateSignupFields,
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
  });
});
