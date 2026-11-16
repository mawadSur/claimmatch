import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAUTH_COPY, ONE_CLICK_COPY } from '@/lib/copy';

const m = vi.hoisted(() => ({
  search: new URLSearchParams(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => m.search,
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock('@/app/onboarding/actions', () => ({ saveOnboardingProfile: vi.fn(), skipOnboarding: vi.fn() }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: m.signInWithOAuth } }),
}));

import { AuthForm } from '@/components/AuthForm';
import { AppleSignInButton, appleReauthRequest, startAppleSignIn } from '@/components/AppleSignInButton';
import { ReauthPrompt } from '@/components/filing/ReauthPrompt';
import { OneClickFiling } from '@/components/filing/OneClickFiling';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { readyView } from './filing-ui-fixtures';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;');
const tag = (html: string, attr: string) => new RegExp(`<button[^>]*\\b${attr}[^>]*>`).exec(html)?.[0] ?? '';

beforeEach(() => {
  m.search = new URLSearchParams();
  m.signInWithOAuth.mockReset();
  m.signInWithOAuth.mockResolvedValue({ data: { url: 'https://appleid.apple.com/auth/authorize?x' }, error: null });
  vi.stubGlobal('window', { location: { origin: 'https://lawsuitai.org', pathname: '/claim/x', search: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Continue with Apple on /login and /signup', () => {
  it('renders only when the page passes apple (APPLE_SIGN_IN_ENABLED), next to the email form', () => {
    for (const mode of ['login', 'signup'] as const) {
      expect(renderToStaticMarkup(createElement(AuthForm, { mode }))).not.toContain(OAUTH_COPY.apple);
      expect(renderToStaticMarkup(createElement(AuthForm, { mode, oauth: true }))).not.toContain(OAUTH_COPY.apple);
      const on = renderToStaticMarkup(createElement(AuthForm, { mode, apple: true }));
      expect(on).toContain(OAUTH_COPY.apple);
      expect(on).toContain('data-oauth-provider="apple"');
      expect(on).not.toContain('data-oauth-provider="google"');
      expect(on).toContain('id="email"');
    }
  });

  it('is Apple’s black button with the Apple logo and "Continue with Apple"', () => {
    const html = renderToStaticMarkup(createElement(AppleSignInButton, { mode: 'signup', next: null }));
    const button = tag(html, 'data-oauth-provider="apple"');
    expect(button).toContain('bg-black');
    expect(button).toContain('text-white');
    expect(button).toContain('type="button"');
    expect(html).toContain('<svg viewBox="0 0 24 24"');
    expect(html).toContain('Continue with Apple');
  });

  it('offers both, one Terms line and one divider, when both flags are on', () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode: 'login', oauth: true, apple: true }));
    expect(html).toContain('data-oauth-provider="google"');
    expect(html).toContain('data-oauth-provider="apple"');
    expect(html).toContain(escape(OAUTH_COPY.agreeLeadBoth));
    expect(html.split(OAUTH_COPY.divider).length - 1).toBe(1);
  });

  it('shows the Apple Terms agreement on /login only', () => {
    expect(renderToStaticMarkup(createElement(AppleSignInButton, { mode: 'login', next: null }))).toContain(
      escape(OAUTH_COPY.agreeLeadApple),
    );
    expect(renderToStaticMarkup(createElement(AppleSignInButton, { mode: 'signup', next: null }))).not.toContain(
      escape(OAUTH_COPY.agreeLeadApple),
    );
  });

  it('names Apple when Apple came back without signing the person in', () => {
    m.search = new URLSearchParams('oauth=failed&provider=apple');
    const html = renderToStaticMarkup(createElement(AppleSignInButton, { mode: 'login', next: null }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(escape(OAUTH_COPY.appleFailed));
    m.search = new URLSearchParams('oauth=failed');
    expect(renderToStaticMarkup(createElement(AppleSignInButton, { mode: 'login', next: null }))).toContain(
      escape(OAUTH_COPY.failed),
    );
  });
});

describe('startAppleSignIn', () => {
  it('asks Supabase for Apple with this origin’s /auth/callback, the safe next, and the name and email scopes', async () => {
    expect(await startAppleSignIn({ next: '/claim/real-settlement' })).toBeNull();
    const call = m.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe('apple');
    const redirect = new URL(call.options.redirectTo);
    expect(redirect.origin).toBe('https://lawsuitai.org');
    expect(redirect.pathname).toBe('/auth/callback');
    expect(redirect.searchParams.get('oauth')).toBe('apple');
    expect(redirect.searchParams.get('next')).toBe('/claim/real-settlement');
    expect(call.options.scopes).toBe('name email');
    expect(call.options.queryParams).toBeUndefined();
  });

  it('maps errors with the signup error mapper, never Supabase’s raw text', async () => {
    m.signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'Unsupported provider: provider is not enabled' } });
    const failed = await startAppleSignIn({ next: null });
    expect(failed?.error).not.toContain('Unsupported provider');
    m.signInWithOAuth.mockRejectedValue(new Error('network down'));
    expect((await startAppleSignIn({ next: null }))?.code).toBe('unknown');
  });

  it('signing in again with Apple comes back to the same claim page', async () => {
    const request = appleReauthRequest({ pathname: '/claim/real-settlement', search: '?step=sign' });
    expect(request).toEqual({ next: '/claim/real-settlement?step=sign' });
    await startAppleSignIn(request);
    const call = m.signInWithOAuth.mock.calls[0][0];
    expect(new URL(call.options.redirectTo).searchParams.get('next')).toBe('/claim/real-settlement?step=sign');
  });
});

describe('sign in again with Apple before e-signing', () => {
  it('Apple members get "Sign in again with Apple", and the password form stays', () => {
    const html = renderToStaticMarkup(
      createElement(ReauthPrompt, { email: 'x7k2m9q4ab@privaterelay.appleid.com', apple: true, onSignedIn: async () => undefined }),
    );
    const button = tag(html, 'id="filing-reauth-apple"');
    expect(button).toContain('type="button"');
    expect(button).toContain('bg-black');
    expect(html).toContain(ONE_CLICK_COPY.reauth.apple);
    expect(html).toContain(escape(ONE_CLICK_COPY.reauth.appleBody));
    expect(html).not.toContain('id="filing-reauth-google"');
    expect(html).toContain('id="filing-reauth-password"');
  });

  it('an account with both gets both buttons and says so', () => {
    const html = renderToStaticMarkup(
      createElement(ReauthPrompt, { email: 'ada@example.com', google: true, apple: true, onSignedIn: async () => undefined }),
    );
    expect(html).toContain('id="filing-reauth-google"');
    expect(html).toContain('id="filing-reauth-apple"');
    expect(html).toContain(escape(ONE_CLICK_COPY.reauth.bothBody));
  });

  it('the claim flow passes the Apple option down to the prompt', () => {
    const view = readyView({ actions: { needs_fresh_sign_in: true } });
    const off = renderToStaticMarkup(createElement(OneClickFiling, { view, accountEmail: 'a@example.com', onChange: () => undefined }));
    expect(off).not.toContain('id="filing-reauth-apple"');
    const on = renderToStaticMarkup(
      createElement(OneClickFiling, { view, accountEmail: 'a@example.com', reauthWithApple: true, onChange: () => undefined }),
    );
    expect(on).toContain('id="filing-reauth-apple"');
    expect(on).not.toContain('id="filing-reauth-google"');
  });
});

describe('a new Apple member without a name', () => {
  it('is asked for their name on the first onboarding step, shown with their relay address', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingWizard, {
        initial: { fullName: '', state: '' },
        email: 'x7k2m9q4ab@privaterelay.appleid.com',
        next: '/claim/real-settlement',
      }),
    );
    const input = /<input[^>]*id="onboarding-name"[^>]*>/.exec(html)?.[0] ?? '';
    expect(input).toContain('autoComplete="name"');
    expect(input).toContain('value=""');
    expect(html).toContain('Your name');
    expect(html).toContain('x7k2m9q4ab@privaterelay.appleid.com');
  });
});
