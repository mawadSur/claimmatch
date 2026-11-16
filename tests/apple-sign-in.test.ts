import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags } from '@/lib/flags';
import { FLAG_CATALOG } from '@/lib/flag-catalog';
import {
  hasAppleIdentity,
  hasGoogleIdentity,
  hasOAuthIdentity,
  oauthDisplayName,
  oauthProviderFromParam,
  oauthProviderOptions,
  oauthRedirectTo,
} from '@/lib/oauth';
import { REAUTH_MAX_AGE_SECONDS } from '@/lib/filing/v2/contract';
import { freshSignInFromClaims } from '@/lib/filing/v2/fresh-sign-in';
import { hasFreshSignIn } from '@/components/filing/fresh-sign-in';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('APPLE_SIGN_IN_ENABLED', () => {
  it('defaults off, turns on only at exactly 1, is in the flag catalog, and does not depend on Google’s flag', () => {
    expect(flags.appleSignIn()).toBe(false);
    vi.stubEnv('APPLE_SIGN_IN_ENABLED', 'true');
    expect(flags.appleSignIn()).toBe(false);
    vi.stubEnv('APPLE_SIGN_IN_ENABLED', '1');
    expect(flags.appleSignIn()).toBe(true);
    expect(flags.oauthSignIn()).toBe(false);
    expect(FLAG_CATALOG.some((f) => f.env === 'APPLE_SIGN_IN_ENABLED')).toBe(true);
  });

  it('/login and /signup pass it to the auth form', () => {
    for (const page of ['login', 'signup']) {
      const src = readFileSync(new URL(`../src/app/${page}/page.tsx`, import.meta.url), 'utf8');
      expect(src).toContain('apple={flags.appleSignIn()}');
    }
  });
});

describe('Apple helpers', () => {
  it('comes back to this origin’s /auth/callback marked as Apple, with a safe next only', () => {
    const url = new URL(oauthRedirectTo('https://preview-123.vercel.app', '/claim/real-settlement', 'apple'));
    expect(url.origin).toBe('https://preview-123.vercel.app');
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('oauth')).toBe('apple');
    expect(url.searchParams.get('next')).toBe('/claim/real-settlement');
    expect(new URL(oauthRedirectTo('https://lawsuitai.org', '//evil.example', 'apple')).searchParams.has('next')).toBe(false);
    // Google stays the default.
    expect(new URL(oauthRedirectTo('https://lawsuitai.org', null)).searchParams.get('oauth')).toBe('google');
  });

  it('asks Apple for name and email, with no Google-only chooser or hint parameters', () => {
    expect(oauthProviderOptions('apple', 'ada@example.com')).toEqual({ scopes: 'name email' });
    expect(oauthProviderOptions('google')).toEqual({ queryParams: { prompt: 'select_account' } });
  });

  it('reads the provider from ?oauth=, treating anything unknown as Google', () => {
    expect(oauthProviderFromParam('apple')).toBe('apple');
    expect(oauthProviderFromParam('google')).toBe('google');
    expect(oauthProviderFromParam('')).toBe('google');
    expect(oauthProviderFromParam(null)).toBe('google');
    expect(oauthProviderFromParam('APPLE')).toBe('google');
  });

  it('finds an Apple identity, and keeps Google and Apple apart', () => {
    const apple = { identities: [{ provider: 'apple' }], app_metadata: { provider: 'apple', providers: ['apple'] } };
    expect(hasAppleIdentity(apple)).toBe(true);
    expect(hasGoogleIdentity(apple)).toBe(false);
    expect(hasAppleIdentity({ identities: [], app_metadata: { providers: ['email', 'apple'] } })).toBe(true);
    expect(hasAppleIdentity({ identities: [{ provider: 'google' }] })).toBe(false);
    expect(hasOAuthIdentity({ identities: [{ provider: 'google' }, { provider: 'apple' }] }, 'google')).toBe(true);
    expect(hasAppleIdentity(null)).toBe(false);
  });

  it('has no name when Apple shares none, and never uses an email address as a name', () => {
    // What Supabase stores for an Apple web sign-in without a name.
    expect(oauthDisplayName({ email: 'x7k2m9q4ab@privaterelay.appleid.com', email_verified: true, sub: '001234.abcd' })).toBeNull();
    expect(oauthDisplayName({ full_name: 'x7k2m9q4ab@privaterelay.appleid.com' })).toBeNull();
    expect(oauthDisplayName({ full_name: 'Ada Lovelace' })).toBe('Ada Lovelace');
  });
});

describe('an Apple sign-in counts as a fresh sign-in for e-signing', () => {
  const USER = 'user-apple';
  const now = new Date('2026-11-15T15:00:00Z');
  const at = (secondsAgo: number) => Math.floor(now.getTime() / 1000) - secondsAgo;
  // GoTrue writes amr method "oauth" for every web OAuth (PKCE) sign-in, Apple included.
  const appleUser = { id: USER, identities: [{ provider: 'apple' }], app_metadata: { provider: 'apple', providers: ['apple'] } };
  const claims = (secondsAgo: number) => ({ sub: USER, session_id: 's-apple', amr: [{ method: 'oauth', timestamp: at(secondsAgo) }] });

  it('an Apple-only member is offered Apple, and a fresh Apple sign-in passes both checks', () => {
    expect(hasAppleIdentity(appleUser)).toBe(true);
    for (const ago of [0, 60, REAUTH_MAX_AGE_SECONDS]) {
      expect(freshSignInFromClaims(claims(ago), USER, now)).toMatchObject({ fresh: true, method: 'oauth', sessionId: 's-apple' });
      expect(hasFreshSignIn(claims(ago), USER, now)).toBe(true);
    }
  });

  it('a stale Apple sign-in fails, and another account’s does not count', () => {
    expect(freshSignInFromClaims(claims(REAUTH_MAX_AGE_SECONDS + 1), USER, now)).toEqual({ fresh: false, reason: 'stale' });
    expect(hasFreshSignIn(claims(REAUTH_MAX_AGE_SECONDS + 1), USER, now)).toBe(false);
    expect(freshSignInFromClaims({ ...claims(10), sub: 'someone-else' }, USER, now).fresh).toBe(false);
  });

  it('the claim page offers Apple only with the flag on and an Apple identity', () => {
    const page = readFileSync(new URL('../src/app/claim/[slug]/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('reauthWithApple: flags.appleSignIn() && hasAppleIdentity(user)');
  });
});
