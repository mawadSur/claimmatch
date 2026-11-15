import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAUTH_COPY, ONE_CLICK_COPY } from '@/lib/copy';

const m = vi.hoisted(() => ({
  search: new URLSearchParams(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => m.search }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: m.signInWithOAuth } }),
}));

import { AuthForm } from '@/components/AuthForm';
import {
  GoogleSignInButton,
  googleReauthRequest,
  rememberBeforeGoogle,
  startGoogleSignIn,
} from '@/components/GoogleSignInButton';
import { ReauthPrompt } from '@/components/filing/ReauthPrompt';
import { OneClickFiling } from '@/components/filing/OneClickFiling';
import { readyView } from './filing-ui-fixtures';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;');
const tag = (html: string, id: string) => new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0] ?? '';

beforeEach(() => {
  m.search = new URLSearchParams();
  m.signInWithOAuth.mockReset();
  m.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/x' }, error: null });
  vi.stubGlobal('window', { location: { origin: 'https://lawsuitai.org', pathname: '/claim/x', search: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Continue with Google on /login and /signup', () => {
  it('renders only when the page passes oauth (OAUTH_SIGN_IN_ENABLED)', () => {
    for (const mode of ['login', 'signup'] as const) {
      expect(renderToStaticMarkup(createElement(AuthForm, { mode }))).not.toContain(OAUTH_COPY.google);
      const on = renderToStaticMarkup(createElement(AuthForm, { mode, oauth: true }));
      expect(on).toContain(OAUTH_COPY.google);
      expect(on).toContain('data-oauth-provider="google"');
      // The email form stays.
      expect(on).toContain('id="email"');
    }
  });

  it('shows the Terms and Privacy agreement on /login before leaving for Google', () => {
    const html = renderToStaticMarkup(createElement(GoogleSignInButton, { mode: 'login', next: null }));
    expect(html).toContain(escape(OAUTH_COPY.agreeLead));
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it('says so when Google came back without signing the person in', () => {
    expect(renderToStaticMarkup(createElement(GoogleSignInButton, { mode: 'login', next: null }))).not.toContain('role="alert"');
    m.search = new URLSearchParams('oauth=failed');
    const html = renderToStaticMarkup(createElement(GoogleSignInButton, { mode: 'login', next: null }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(escape(OAUTH_COPY.failed));
  });

  it('the signup page keeps its own Terms line under the form', async () => {
    const { readFileSync } = await import('node:fs');
    const signup = readFileSync(new URL('../src/app/signup/page.tsx', import.meta.url), 'utf8');
    expect(signup).toContain('By creating an account, you agree to the');
    expect(signup).toContain('oauth={flags.oauthSignIn()}');
    const login = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8');
    expect(login).toContain('oauth={flags.oauthSignIn()}');
  });
});

describe('startGoogleSignIn', () => {
  it('asks Supabase for Google with this origin’s /auth/callback and the safe next', async () => {
    expect(await startGoogleSignIn({ next: '/claim/real-settlement' })).toBeNull();
    const call = m.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe('google');
    const redirect = new URL(call.options.redirectTo);
    expect(redirect.origin).toBe('https://lawsuitai.org');
    expect(redirect.pathname).toBe('/auth/callback');
    expect(redirect.searchParams.get('oauth')).toBe('google');
    expect(redirect.searchParams.get('next')).toBe('/claim/real-settlement');
    expect(call.options.queryParams).toEqual({ prompt: 'select_account' });
  });

  it('passes the account email as a login hint when signing in again', async () => {
    await startGoogleSignIn({ next: '/claim/x', loginHint: 'ada@example.com' });
    expect(m.signInWithOAuth.mock.calls[0][0].options.queryParams).toEqual({
      prompt: 'select_account',
      login_hint: 'ada@example.com',
    });
  });

  it('maps errors with the signup error mapper, never Supabase’s raw text', async () => {
    m.signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'Request rate limit reached' } });
    const failed = await startGoogleSignIn({ next: null });
    expect(failed?.code).toBe('rate_limited');
    expect(failed?.error).not.toContain('Request rate limit reached');

    m.signInWithOAuth.mockRejectedValue(new Error('network down'));
    expect((await startGoogleSignIn({ next: null }))?.code).toBe('unknown');
  });
});

describe('before leaving for Google', () => {
  function stubBrowser(protocol: string) {
    const doc = { cookie: '' };
    const storage = new Map<string, string>();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', {
      location: { origin: `${protocol}//lawsuitai.org`, protocol, pathname: '/signup', search: '' },
      sessionStorage: {
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        getItem: (k: string) => storage.get(k) ?? null,
      },
    });
    return { doc, storage };
  }

  it('on /signup, saves the pending-next cookie (Secure on https) and the claim context', () => {
    const { doc, storage } = stubBrowser('https:');
    rememberBeforeGoogle('signup', '/claim/real-settlement');
    expect(doc.cookie).toBe(`cm_next=${encodeURIComponent('/claim/real-settlement')}; Path=/; Max-Age=86400; SameSite=Lax; Secure`);
    expect([...storage.values()]).toContain('/claim/real-settlement');
  });

  it('on /signup without a next, clears a stale pending-next cookie', () => {
    const { doc } = stubBrowser('http:');
    rememberBeforeGoogle('signup', null);
    expect(doc.cookie).toBe('cm_next=; Path=/; Max-Age=0; SameSite=Lax');
  });

  it('on /login, leaves the cookie alone (next travels in redirectTo)', () => {
    const { doc } = stubBrowser('https:');
    rememberBeforeGoogle('login', '/claim/real-settlement');
    expect(doc.cookie).toBe('');
  });

  it('signing in again with Google comes back to the same claim page, hinted with the account email', async () => {
    const request = googleReauthRequest({ pathname: '/claim/real-settlement', search: '?step=sign' }, 'ada@example.com');
    expect(request).toEqual({ next: '/claim/real-settlement?step=sign', loginHint: 'ada@example.com' });
    expect(await startGoogleSignIn(request)).toBeNull();
    const call = m.signInWithOAuth.mock.calls[0][0];
    expect(new URL(call.options.redirectTo).searchParams.get('next')).toBe('/claim/real-settlement?step=sign');
    expect(call.options.queryParams.login_hint).toBe('ada@example.com');
  });
});

describe('sign in again before e-signing', () => {
  it('password members see the password form only', () => {
    const html = renderToStaticMarkup(createElement(ReauthPrompt, { email: 'ada@example.com', onSignedIn: async () => undefined }));
    expect(html).not.toContain(ONE_CLICK_COPY.reauth.google);
    expect(tag(html, 'filing-reauth-password')).toContain('type="password"');
    expect(html).toContain(escape(ONE_CLICK_COPY.reauth.body));
  });

  it('Google members get "Sign in again with Google", and the password form stays', () => {
    const html = renderToStaticMarkup(
      createElement(ReauthPrompt, { email: 'ada@example.com', google: true, onSignedIn: async () => undefined }),
    );
    expect(tag(html, 'filing-reauth-google')).toContain('type="button"');
    expect(html).toContain(ONE_CLICK_COPY.reauth.google);
    expect(html).toContain(escape(ONE_CLICK_COPY.reauth.googleBody));
    expect(tag(html, 'filing-reauth-password')).toContain('type="password"');
  });

  it('the claim flow passes the Google option down to the prompt', () => {
    const view = readyView({ actions: { needs_fresh_sign_in: true } });
    const off = renderToStaticMarkup(createElement(OneClickFiling, { view, accountEmail: 'ada@example.com', onChange: () => undefined }));
    expect(off).not.toContain('id="filing-reauth-google"');
    const on = renderToStaticMarkup(
      createElement(OneClickFiling, { view, accountEmail: 'ada@example.com', reauthWithGoogle: true, onChange: () => undefined }),
    );
    expect(on).toContain('id="filing-reauth-google"');
  });

  it('the claim page offers Google only with the flag on and a Google identity', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('../src/app/claim/[slug]/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('reauthWithGoogle: flags.oauthSignIn() && hasGoogleIdentity(user)');
  });
});
