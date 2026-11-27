import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: async () => {} } }),
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
}));

const { NavMenu } = await import('@/components/NavMenu');

const render = (signedIn: boolean) =>
  renderToStaticMarkup(createElement(NavMenu, { signedIn, isAdmin: false, noticeLookup: false }));

describe('the Settlements nav tab', () => {
  it('shows for a visitor who is not signed in', () => {
    const html = render(false);
    expect(html).toContain('href="/lawsuits"');
    expect(html).toContain('>Settlements<');
  });

  it('is hidden once signed in, so the dashboard stays the anchor', () => {
    const html = render(true);
    expect(html).not.toContain('href="/lawsuits"');
    expect(html).not.toContain('>Settlements<');
  });

  it('keeps every other tab for a signed-in member', () => {
    const html = render(true);
    for (const href of ['/how-it-works', '/pricing', '/faq', '/dashboard']) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
