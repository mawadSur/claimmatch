import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

import LoginPage from '@/app/login/page';

const render = async (next?: string) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }));

describe('login page', () => {
  it('greets people coming from "Start your claim" as new, with a clear way to sign up', async () => {
    const html = await render('/claim/real-settlement');
    expect(html).toContain('Log in or create a free account');
    expect(html).toContain('You need a free account to keep track of this claim.');
    expect(html).toContain('href="/signup?next=%2Fclaim%2Freal-settlement"');
    expect(html).not.toContain('Welcome back');
  });

  it('stays "Welcome back" otherwise, and never builds a sign-up link from an unsafe next', async () => {
    expect(await render()).toContain('Welcome back');
    expect(await render('/dashboard')).toContain('Welcome back');
    const evil = await render('/\\evil.example/claim/x');
    expect(evil).toContain('Welcome back');
    expect(evil).not.toContain('evil.example');
  });
});
