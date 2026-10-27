import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSED_ARCHIVE_LABEL, recentlyClosed } from '@/lib/recently-closed';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const h = vi.hoisted(() => ({
  catalog: { lawsuits: [] as ReturnType<typeof makeLawsuit>[], error: false },
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupPublishedLawsuits: async () => h.catalog,
  };
});

import RecentlyClosedPage from '@/app/settlements/recently-closed/page';

const now = new Date('2026-10-27T12:00:00Z');

describe('recentlyClosed', () => {
  it('keeps published rows closed or past deadline in the last 90 days', () => {
    const rows = [
      makeLawsuit({}, {
        id: 'fresh',
        title: 'Just closed',
        status: 'closed',
        review_status: 'published',
        deadline: '2026-10-01',
        closed_at: '2026-10-02T00:00:00Z',
      }),
      makeLawsuit({}, {
        id: 'old',
        title: 'Old closed',
        status: 'closed',
        review_status: 'published',
        deadline: '2026-01-01',
        closed_at: '2026-01-02T00:00:00Z',
      }),
      makeLawsuit({}, {
        id: 'open',
        title: 'Still open',
        status: 'open',
        review_status: 'published',
        deadline: '2026-12-01',
      }),
    ];
    expect(recentlyClosed(rows, now).map((r) => r.id)).toEqual(['fresh']);
  });
});

describe('/settlements/recently-closed', () => {
  it('404s when the flag is off', async () => {
    await expect(RecentlyClosedPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders closed rows with the do-not-file label and no claim-rate numbers', async () => {
    vi.stubEnv('CLOSED_ARCHIVE_ENABLED', '1');
    h.catalog = {
      error: false,
      lawsuits: [
        makeLawsuit({}, {
          id: 'fresh',
          slug: 'just-closed',
          title: 'Just closed settlement',
          status: 'closed',
          review_status: 'published',
          deadline: '2026-10-01',
          closed_at: '2026-10-02T00:00:00Z',
          claim_url: 'https://official.example/claim',
        }),
      ],
    };
    const html = renderToStaticMarkup(await RecentlyClosedPage());
    expect(html).toContain(CLOSED_ARCHIVE_LABEL);
    expect(html).toContain('Just closed settlement');
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html).not.toMatch(/claim rate/i);
  });
});
