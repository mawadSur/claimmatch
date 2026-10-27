import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_NOT_FOUND, rankNoticeMatches } from '@/lib/notice-lookup';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const h = vi.hoisted(() => ({
  catalog: { lawsuits: [] as ReturnType<typeof makeLawsuit>[], error: false },
}));

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupPublishedLawsuits: async () => h.catalog,
  };
});

import { GET } from '@/app/api/lookup/route';

function hit(q: string) {
  return GET(new Request(`http://localhost/api/lookup?q=${encodeURIComponent(q)}`));
}

describe('rankNoticeMatches', () => {
  const rows = [
    makeLawsuit({}, {
      id: '1',
      title: 'Amazon Return Policy Settlement',
      administrator: 'Angeion Group',
      external_id: 'settlesignal:amazon-return',
      claim_url: 'https://www.returnsettlement.com/submit-claim',
    }),
    makeLawsuit({}, {
      id: '2',
      title: 'Meta Pixel Privacy Settlement',
      administrator: 'JND Legal',
      external_id: 'meta-pixel-1',
    }),
  ];

  it('ranks title, administrator, and claim-id matches and caps at 5', () => {
    expect(rankNoticeMatches('Amazon Return', rows).map((r) => r.id)).toEqual(['1']);
    expect(rankNoticeMatches('Angeion', rows).map((r) => r.id)).toEqual(['1']);
    expect(rankNoticeMatches('meta-pixel-1', rows).map((r) => r.id)).toEqual(['2']);
    expect(rankNoticeMatches('zzzz', rows)).toEqual([]);
    expect(rankNoticeMatches('  ', rows)).toEqual([]);
  });
});

describe('GET /api/lookup', () => {
  it('404s when the flag is off', async () => {
    expect((await hit('Amazon')).status).toBe(404);
  });

  it('returns catalog matches or the honest not-found message', async () => {
    vi.stubEnv('NOTICE_LOOKUP_ENABLED', '1');
    h.catalog = {
      error: false,
      lawsuits: [
        makeLawsuit({}, {
          id: '1',
          slug: 'amazon-return-policy-settlement',
          title: 'Amazon Return Policy Settlement',
          deadline: '2026-12-01',
          claim_url: 'https://www.returnsettlement.com/submit-claim',
        }),
      ],
    };
    const found = await hit('Amazon Return');
    expect(found.status).toBe(200);
    const body = await found.json();
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].title).toBe('Amazon Return Policy Settlement');
    expect(body.matches[0].official.host).toBe('returnsettlement.com');
    expect(body.message).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/scam|legit|score/i);

    const missing = await hit('unknown notice xyz');
    expect((await missing.json()).message).toBe(NOTICE_NOT_FOUND);
  });
});
