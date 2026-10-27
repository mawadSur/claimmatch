import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeNarrowing } from '@/components/home/HomeNarrowing';

afterEach(() => {
  vi.unstubAllEnvs();
});

vi.mock('@/lib/lawsuits', () => ({
  lookupLawsuits: async () => ({ lawsuits: [], error: false }),
}));

import HomePage from '@/app/page';

describe('C17 home narrowing', () => {
  it('renders the two entry points without match language', () => {
    const html = renderToStaticMarkup(createElement(HomeNarrowing));
    expect(html).toContain('Data breach');
    expect(html).toContain('Privacy');
    expect(html).toContain('No proof required');
    expect(html).toContain('/lawsuits?proof=no');
    expect(html).not.toMatch(/\bmatch/i);
  });

  it('stays off the home page unless the flag is exactly 1', async () => {
    const off = renderToStaticMarkup(createElement(await HomePage()));
    expect(off).not.toContain('No proof required');
    expect(off).not.toContain('Start with a type of settlement');

    vi.stubEnv('HOME_NARROWING_ENABLED', '1');
    const on = renderToStaticMarkup(createElement(await HomePage()));
    expect(on).toContain('Start with a type of settlement');
    expect(on).toContain('No proof required');
    expect(on).not.toMatch(/\bmatch(?:ed|es|ing)?\b/i);
  });
});
