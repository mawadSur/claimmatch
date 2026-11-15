import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags } from '@/lib/flags';
import { FLAG_CATALOG } from '@/lib/flag-catalog';
import {
  hasGoogleIdentity,
  oauthDestination,
  oauthDisplayName,
  oauthRedirectTo,
} from '@/lib/oauth';
import { FRESH_SIGN_IN_METHODS, REAUTH_MAX_AGE_SECONDS } from '@/lib/filing/v2/contract';
import { freshSignInFromClaims } from '@/lib/filing/v2/fresh-sign-in';
import { hasFreshSignIn } from '@/components/filing/fresh-sign-in';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OAUTH_SIGN_IN_ENABLED', () => {
  it('defaults off, turns on only at exactly 1, and is in the flag catalog', () => {
    expect(flags.oauthSignIn()).toBe(false);
    vi.stubEnv('OAUTH_SIGN_IN_ENABLED', 'true');
    expect(flags.oauthSignIn()).toBe(false);
    vi.stubEnv('OAUTH_SIGN_IN_ENABLED', '1');
    expect(flags.oauthSignIn()).toBe(true);
    expect(FLAG_CATALOG.some((f) => f.env === 'OAUTH_SIGN_IN_ENABLED')).toBe(true);
  });
});

describe('oauthRedirectTo', () => {
  it('comes back to this origin’s /auth/callback, marked as Google, with a safe next only', () => {
    const url = new URL(oauthRedirectTo('https://preview-123.vercel.app', '/claim/real-settlement?x=1'));
    expect(url.origin).toBe('https://preview-123.vercel.app');
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('oauth')).toBe('google');
    expect(url.searchParams.get('next')).toBe('/claim/real-settlement?x=1');
  });

  it('drops a next that could leave the site', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/..//evil.example']) {
      const url = new URL(oauthRedirectTo('https://lawsuitai.org', bad));
      expect(url.searchParams.has('next')).toBe(false);
    }
    expect(new URL(oauthRedirectTo('https://lawsuitai.org', null)).searchParams.has('next')).toBe(false);
  });
});

describe('oauthDestination', () => {
  it('sends a new member to onboarding first, then where they were headed', () => {
    expect(oauthDestination('/claim/x', false)).toBe('/onboarding?next=%2Fclaim%2Fx');
    expect(oauthDestination(null, false)).toBe('/onboarding');
    expect(oauthDestination('/onboarding?next=%2Fclaim%2Fx', false)).toBe('/onboarding?next=%2Fclaim%2Fx');
  });

  it('sends an onboarded member straight there, or to the dashboard', () => {
    expect(oauthDestination('/claim/x', true)).toBe('/claim/x');
    expect(oauthDestination(null, true)).toBe('/dashboard');
    expect(oauthDestination('//evil.example', true)).toBe('/dashboard');
  });
});

describe('oauthDisplayName', () => {
  it('reads full_name, then name, from Google’s metadata', () => {
    expect(oauthDisplayName({ full_name: 'Ada Lovelace', name: 'Ada' })).toBe('Ada Lovelace');
    expect(oauthDisplayName({ name: '  Ada   Lovelace ' })).toBe('Ada Lovelace');
    expect(oauthDisplayName({ full_name: '   ', name: 'Ada' })).toBe('Ada');
  });

  it('is null without a usable name, strips control characters and caps the length', () => {
    expect(oauthDisplayName(null)).toBeNull();
    expect(oauthDisplayName({ full_name: 42 })).toBeNull();
    expect(oauthDisplayName({ name: 'Ada\nLovelace' })).toBe('Ada Lovelace');
    expect(oauthDisplayName({ name: 'x'.repeat(500) })?.length).toBe(200);
  });
});

describe('hasGoogleIdentity', () => {
  it('is true for a linked Google identity or provider, false otherwise', () => {
    expect(hasGoogleIdentity({ identities: [{ provider: 'email' }, { provider: 'google' }] })).toBe(true);
    expect(hasGoogleIdentity({ identities: [], app_metadata: { providers: ['email', 'google'] } })).toBe(true);
    expect(hasGoogleIdentity({ app_metadata: { provider: 'google' } })).toBe(true);
    expect(hasGoogleIdentity({ identities: [{ provider: 'email' }], app_metadata: { provider: 'email', providers: ['email'] } })).toBe(false);
    expect(hasGoogleIdentity(null)).toBe(false);
  });
});

describe('a Google sign-in counts as a fresh sign-in for e-signing', () => {
  const USER = 'user-a';
  const now = new Date('2026-11-14T15:00:00Z');
  const at = (secondsAgo: number) => Math.floor(now.getTime() / 1000) - secondsAgo;
  // GoTrue writes amr method "oauth" for a web OAuth (PKCE) sign-in.
  const claims = (secondsAgo: number) => ({ sub: USER, session_id: 's1', amr: [{ method: 'oauth', timestamp: at(secondsAgo) }] });

  it('FRESH_SIGN_IN_METHODS and filing_sign_packet (0043) both accept oauth', () => {
    expect(FRESH_SIGN_IN_METHODS).toContain('oauth');
    const sql = readFileSync(
      fileURLToPath(new URL('../supabase/migrations/0043_one_click_filing_functions.sql', import.meta.url)),
      'utf8',
    );
    const list = /p_auth_method not in \(([^)]*)\)/s.exec(sql)?.[1] ?? '';
    expect(list).toContain("'oauth'");
    for (const email of ['otp', 'magiclink', 'recovery', 'invite']) expect(list).not.toContain(`'${email}'`);
  });

  it('passes within 15 minutes (server check and claim-page check)', () => {
    for (const ago of [0, 60, REAUTH_MAX_AGE_SECONDS]) {
      expect(freshSignInFromClaims(claims(ago), USER, now)).toMatchObject({ fresh: true, method: 'oauth', sessionId: 's1' });
      expect(hasFreshSignIn(claims(ago), USER, now)).toBe(true);
    }
  });

  it('fails once it is older than 15 minutes', () => {
    for (const ago of [REAUTH_MAX_AGE_SECONDS + 1, 3600, 86_400]) {
      expect(freshSignInFromClaims(claims(ago), USER, now)).toEqual({ fresh: false, reason: 'stale' });
      expect(hasFreshSignIn(claims(ago), USER, now)).toBe(false);
    }
  });

  it('a stale oauth entry does not borrow a fresh one from another user', () => {
    expect(freshSignInFromClaims({ ...claims(10), sub: 'user-b' }, USER, now).fresh).toBe(false);
    expect(hasFreshSignIn({ ...claims(10), sub: 'user-b' }, USER, now)).toBe(false);
  });
});
