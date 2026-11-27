import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
const signup = read('src/app/signup/page.tsx');
const authForm = read('src/components/AuthForm.tsx');

describe('/signup puts the sign-in options on the first screen', () => {
  it('renders the auth card above everything that explains the account', () => {
    expect(signup.indexOf('<AuthForm')).toBeGreaterThan(0);
    expect(signup.indexOf('<AuthForm')).toBeLessThan(signup.indexOf('<WhyAccountExplainer'));
    expect(signup.indexOf('<AuthForm')).toBeLessThan(signup.indexOf('bullets.map'));
    expect(signup.indexOf('<AuthForm')).toBeLessThan(signup.indexOf('<PublicTrustBlock'));
  });

  it('still passes both OAuth kill switches and keeps the explainer on the page', () => {
    expect(signup).toContain('oauth={flags.oauthSignIn()}');
    expect(signup).toContain('apple={flags.appleSignIn()}');
    // e2e/journey-public.spec.ts asserts /why an account/i on this page.
    expect(signup).toContain('<WhyAccountExplainer');
    expect(signup).toContain('bullets.map');
  });

  it('keeps Apple and Google above the email fields inside the card', () => {
    expect(authForm.indexOf('OAuthSignInButtons')).toBeLessThan(authForm.indexOf('id="email"'));
  });
});

describe('the sign-up password rule is a hint while typing, not an error', () => {
  it('waits for blur or submit before turning the rule red', () => {
    expect(authForm).toContain('onBlur');
    expect(authForm).not.toContain('next.length > 0 && next.length < MIN_PASSWORD_LENGTH');
    expect(authForm).toContain('password-hint');
    expect(authForm).toContain('signupPasswordHint');
    expect(authForm).toContain('validateSignupFields');
  });
});
