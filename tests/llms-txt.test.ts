import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { BETA_FEE_COPY, OFFICIAL_FILING_IS_FREE } from '@/lib/copy';
import { catalogHubLinks, officialGuideLinks, renderLlmsTxt } from '@/lib/llms-txt';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('catalogHubLinks', () => {
  it('ranks live categories by open-row count', () => {
    const hubs = catalogHubLinks([
      { category: 'Privacy' },
      { category: 'Privacy' },
      { category: 'Data Breach' },
      { category: 'Privacy' },
      { category: '' },
    ]);
    expect(hubs[0]).toEqual({ name: 'Privacy', path: '/settlements/category/privacy' });
    expect(hubs.some((h) => h.path === '/settlements/category/data-breach')).toBe(true);
  });

  it('falls back to known catalog categories when the feed is empty', () => {
    const hubs = catalogHubLinks([]);
    expect(hubs.length).toBeGreaterThan(0);
    expect(hubs[0]?.path).toMatch(/^\/settlements\/category\//);
  });
});

describe('renderLlmsTxt', () => {
  it('uses site copy, hubs, how-it-works, trust, privacy and terms', () => {
    const body = renderLlmsTxt({
      categoryHubs: [{ name: 'Data Breach', path: '/settlements/category/data-breach' }],
      feeLine: BETA_FEE_COPY,
    });
    expect(body.startsWith('# Lawsuit AI')).toBe(true);
    expect(body).not.toContain('ClaimMatch');
    expect(body).toContain(SHORT_DISCLAIMER.replaceAll('Lawsuit AI', 'Lawsuit AI'));
    expect(body).toContain(OFFICIAL_FILING_IS_FREE);
    expect(body).toContain(BETA_FEE_COPY.replaceAll('Lawsuit AI', 'Lawsuit AI'));
    expect(body).toContain('Matching on Lawsuit AI is free.');
    expect(body).toContain('/lawsuits');
    expect(body).toContain('/settlements/closing-soon');
    expect(body).toContain('/settlements/category/data-breach');
    expect(body).toContain('/how-it-works');
    expect(body).toContain('/trust');
    expect(body).toContain('/privacy');
    expect(body).toContain('/terms');
    expect(body).toMatch(/we file claims for you on supported settlements/i);
    expect(body).not.toMatch(/you(?:'|’)re owed|15%/i);
    expect(body).not.toContain('Official-notice settlement guides');
  });

  it('lists official-notice settlement pages when the catalog has them', () => {
    const body = renderLlmsTxt({
      officialGuides: [
        {
          name: 'RealPage Rental Software Antitrust Settlement',
          path: '/lawsuits/realpage-rental-software-antitrust-settlement',
        },
      ],
      feeLine: BETA_FEE_COPY,
    });
    expect(body).toContain('## Official-notice settlement guides');
    expect(body).toContain('/lawsuits/realpage-rental-software-antitrust-settlement');
    expect(body).toContain('RealPage Rental Software Antitrust Settlement');
  });
});

describe('officialGuideLinks', () => {
  it('keeps only catalog rows that have an official-notice guide', () => {
    const links = officialGuideLinks([
      { slug: 'realpage-rental-software-antitrust-settlement', title: 'RealPage Rental Software Antitrust Settlement' },
      { slug: 'quiet-settlement', title: 'Quiet Settlement' },
      { slug: 'realpage-rental-software-antitrust-settlement', title: 'Duplicate' },
    ]);
    expect(links).toEqual([
      {
        name: 'RealPage Rental Software Antitrust Settlement',
        path: '/lawsuits/realpage-rental-software-antitrust-settlement',
      },
    ]);
  });
});

describe('GET /llms.txt', () => {
  it('returns 404 when LLMS_TXT_ENABLED is off', async () => {
    vi.stubEnv('LLMS_TXT_ENABLED', '');
    const { GET } = await import('@/app/llms.txt/route');
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns the summary when the flag is exactly 1', async () => {
    vi.stubEnv('LLMS_TXT_ENABLED', '1');
    vi.resetModules();
    const { GET } = await import('@/app/llms.txt/route');
    const res = await GET();
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('# Lawsuit AI');
    expect(body).not.toContain('ClaimMatch');
    expect(body).toContain('/how-it-works');
    expect(body).toContain('/privacy');
  });
});
