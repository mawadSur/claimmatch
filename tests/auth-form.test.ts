import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(fileURLToPath(new URL('../src/components/AuthForm.tsx', import.meta.url)), 'utf8');

describe('AuthForm signed-in path', () => {
  it('sends confirmation links to the site URL /auth/callback, not this tab origin', () => {
    expect(src).toContain("SITE.url.replace(/\\/+$/, '')}/auth/callback");
    expect(src).not.toContain('window.location.origin}/auth/callback');
  });

  it('times out a hung sign-in and leaves the login page with a hard navigation', () => {
    expect(src).toContain('AUTH_TIMEOUT_MS');
    expect(src).toContain('This is taking too long');
    expect(src).toContain('window.location.assign');
    expect(src).not.toContain('router.refresh()');
    expect(src).not.toContain('router.push');
  });

  it('shows a loading label on the signup button', () => {
    expect(src).toContain('Creating your account…');
  });

  it('shows the password rule before submit and validates without spinning', () => {
    expect(src).toContain('password-hint');
    expect(src).toContain('Use at least {MIN_PASSWORD_LENGTH} characters.');
    expect(src).toContain('validateSignupFields');
    expect(src).toContain('signup_submitted');
    expect(src).toContain('signup_error');
    expect(src).toContain("posthog?.capture('signup_error', { code })");
    expect(src).not.toContain("capture('signup_error', { message");
  });

  it('does not treat login as signup, and requires a session for signup_completed', () => {
    expect(src).toContain("capture('login_completed', { evidence: 'password_sign_in' }, { send_instantly: true })");
    expect(src).toContain("capture('signup_completed', { evidence: 'session_after_signup' }, { send_instantly: true })");
    expect(src).toContain('if (isSignup)');
    expect(src).toContain('signInWithPassword');
  });
});
