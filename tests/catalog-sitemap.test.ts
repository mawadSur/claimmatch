import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';

const listed = vi.hoisted(() => ({ lawsuits: [] as Lawsuit[] }));

vi.mock('@/lib/lawsuits', () => ({
  getLawsuits: async () => listed.lawsuits,
  categoriesOf: (lawsuits: { category?: string }[]) =>
    Array.from(new Set(lawsuits.map((l) => l.category).filter(Boolean))).sort(),
}));

import sitemap from '@/app/sitemap';

afterEach(() => {
  vi.unstubAllEnvs();
});

function lawsuit(overrides: Partial<Lawsuit> = {}): Lawsuit {
  return {
    id: '1',
    slug: 'amazon-return-policy-settlement',
    title: 'Amazon Return Policy Settlement',
    status: 'open',
    review_status: 'published',
    deadline: '2099-12-01',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Lawsuit;
}

describe('sitemap', () => {
  it('lists only settlements getLawsuits returns (open for claims)', async () => {
    listed.lawsuits = [lawsuit()];
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/lawsuits/amazon-return-policy-settlement'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/lawsuits'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/settlements/closing-soon'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/settlements/new'))).toBe(true);
    expect(urls.some((u) => u.includes('/settlements/recently-closed'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/check'))).toBe(false);
  });

  it('includes /check only when the notice-lookup flag is on', async () => {
    listed.lawsuits = [lawsuit()];
    vi.stubEnv('NOTICE_LOOKUP_ENABLED', '1');
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/check'))).toBe(true);
    expect(urls.some((u) => u.includes('/settlements/recently-closed'))).toBe(false);
  });

  it('omits thin settlements that the detail page noindexes', async () => {
    listed.lawsuits = [
      lawsuit(),
      lawsuit({
        slug: 'thin-settlement',
        deadline: null,
        eligibility_text: null,
        administrator: null,
        typical_payout: null,
      }),
    ];
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/lawsuits/amazon-return-policy-settlement'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/lawsuits/thin-settlement'))).toBe(false);
  });

  it('omits closed and expired rows because getLawsuits already dropped them', async () => {
    listed.lawsuits = [];
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.every((u) => !u.includes('/lawsuits/'))).toBe(true);
  });
});
