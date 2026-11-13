import { describe, expect, it, vi } from 'vitest';
import { fetchOfficialPage, needsVerificationDraft } from '@/lib/verification-draft-fetch';

function htmlRes(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

describe('fetchOfficialPage', () => {
  it('skips the page when robots.txt disallows the path', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow: /\n', { status: 200 });
      }
      return htmlRes('should not fetch');
    }) as unknown as typeof fetch;
    const result = await fetchOfficialPage('https://example.test/claim', fetchFn);
    expect(result.signal).toBe('robots_disallow');
    expect(result.robots_allowed).toBe(false);
    expect(result.body).toBe('');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetches HTML when robots.txt is missing', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).endsWith('/robots.txt')) return new Response('not found', { status: 404 });
      return htmlRes('<p>File a claim</p>');
    }) as unknown as typeof fetch;
    const result = await fetchOfficialPage('https://example.test/claim', fetchFn);
    expect(result.signal).toBe('ok');
    expect(result.robots_allowed).toBe(true);
    expect(result.body).toContain('File a claim');
    expect(result.http_status).toBe(200);
  });

  it('rejects non-http URLs without calling fetch', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const result = await fetchOfficialPage('javascript:alert(1)', fetchFn);
    expect(result.signal).toBe('invalid_url');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('needsVerificationDraft', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  it('is due when never drafted or stale', () => {
    expect(needsVerificationDraft({ drafted_at: null }, now)).toBe(true);
    expect(needsVerificationDraft({ drafted_at: '2026-11-12T00:00:00Z' }, now)).toBe(false);
    expect(needsVerificationDraft({ drafted_at: '2026-10-01T00:00:00Z' }, now)).toBe(true);
  });
});
