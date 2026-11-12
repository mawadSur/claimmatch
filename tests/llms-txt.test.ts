import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { BETA_FEE_COPY, OFFICIAL_FILING_IS_FREE } from '@/lib/copy';
import { catalogHubLinks, renderLlmsTxt } from '@/lib/llms-txt';

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
    expect(body.startsWith('# LawsuitAI')).toBe(true);
    expect(body).not.toContain('ClaimMatch');
    expect(body).toContain(SHORT_DISCLAIMER.replaceAll('ClaimMatch', 'LawsuitAI'));
    expect(body).toContain(OFFICIAL_FILING_IS_FREE);
    expect(body).toContain(BETA_FEE_COPY.replaceAll('ClaimMatch', 'LawsuitAI'));
    expect(body).toContain('Matching on LawsuitAI is free.');
    expect(body).toContain('/lawsuits');
    expect(body).toContain('/settlements/closing-soon');
    expect(body).toContain('/settlements/category/data-breach');
    expect(body).toContain('/how-it-works');
    expect(body).toContain('/trust');
    expect(body).toContain('/privacy');
    expect(body).toContain('/terms');
    expect(body).not.toMatch(/we file|you(?:'|’)re owed|15%/i);
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
    expect(body).toContain('# LawsuitAI');
    expect(body).not.toContain('ClaimMatch');
    expect(body).toContain('/how-it-works');
    expect(body).toContain('/privacy');
  });
});
