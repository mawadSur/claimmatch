import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/cron/link-check/route';
import { checkOfficialUrl, isBrokenLink, LINK_CHECK_USER_AGENT } from '@/lib/link-check';

const SECRET = 'test-cron-secret';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('official link checker', () => {
  it('classifies 200 as ok and 404 as broken', async () => {
    const fetch200 = vi.fn().mockResolvedValue({ status: 200 });
    const ok = await checkOfficialUrl('https://example.com/claim', fetch200);
    expect(ok).toEqual({ status: 'ok', httpStatus: 200 });
    expect(fetch200).toHaveBeenCalledWith(
      'https://example.com/claim',
      expect.objectContaining({
        method: 'HEAD',
        headers: expect.objectContaining({ 'user-agent': LINK_CHECK_USER_AGENT }),
      }),
    );

    const fetch404 = vi.fn().mockResolvedValue({ status: 404 });
    const broken = await checkOfficialUrl('https://example.com/gone', fetch404);
    expect(broken).toEqual({ status: 'broken', httpStatus: 404 });
    expect(isBrokenLink(broken)).toBe(true);
  });

  it('records a timeout', async () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const fetchTimeout = vi.fn().mockRejectedValue(err);
    const result = await checkOfficialUrl('https://example.com/slow', fetchTimeout, 5);
    expect(result.status).toBe('timeout');
    expect(isBrokenLink(result)).toBe(true);
  });
});

describe('/api/cron/link-check', () => {
  it('rejects calls without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await GET(new Request('https://claimmatch.test/api/cron/link-check'));
    expect(res.status).toBe(401);
  });

  it('no-ops when the flag is off', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('LINK_CHECK_ENABLED', '');
    const res = await GET(
      new Request('https://claimmatch.test/api/cron/link-check', {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });
});
