import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => query.value,
  usePathname: () => '/login',
}));

import LoginPage from '@/app/login/page';

const render = async (next?: string, confirmation?: Record<string, string>) => {
  const params = { ...(next === undefined ? {} : { next }), ...confirmation };
  query.value = new URLSearchParams(params);
  return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));
};

describe('login page', () => {
  it('offers a sign-in link first when email is confirmed but this browser is not signed in', async () => {
    const html = await render('/claim/real-settlement', { confirmed: '1' });
    expect(html).toContain('Your email is confirmed');
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/<button type="submit"[^>]*btn-primary[^>]*>Email me a sign-in link/);
    expect(html).toMatch(/<button type="button"[^>]*btn-secondary[^>]*>Use a password instead/);
  });

  it('keeps password login as the default and makes both alternatives easy to tap', async () => {
    const html = await render();
    expect(html).toContain('type="password"');
    expect(html).toMatch(/<button type="button"[^>]*btn-secondary[^>]*>Email me a sign-in link/);
    expect(html).toMatch(/<a[^>]*btn-secondary[^>]*href="\/forgot-password">Forgot password\?/);
  });
  it('greets people coming from "Start your claim" as new, with a clear way to sign up', async () => {
    const html = await render('/claim/real-settlement');
    expect(html).toContain('Log in or create a free account');
    expect(html).toContain('You need a free account to keep track of this claim.');
    expect(html).toContain('href="/signup?next=%2Fclaim%2Freal-settlement"');
    expect(html).not.toContain('Welcome back');
  });

  it('asks "New to Lawsuit AI?" once, from a claim and otherwise', async () => {
    const fromClaim = await render('/claim/real-settlement');
    expect(fromClaim.match(/New to Lawsuit AI\?/g)).toHaveLength(1);
    expect(fromClaim).toContain('Create a free account');
    expect(fromClaim).not.toContain('Create an account');

    const plain = await render();
    expect(plain.match(/New to Lawsuit AI\?/g)).toHaveLength(1);
    expect(plain).toContain('Create an account');
    expect(plain).not.toContain('Create a free account');
  });

  it('stays "Welcome back" otherwise, and never builds a sign-up link from an unsafe next', async () => {
    expect(await render()).toContain('Welcome back');
    expect(await render('/dashboard')).toContain('Welcome back');
    const evil = await render('/\\evil.example/claim/x');
    expect(evil).toContain('Welcome back');
    expect(evil).not.toContain('evil.example');
  });
});
