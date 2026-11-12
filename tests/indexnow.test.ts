import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  indexNowKey,
  indexNowKeyFileRequest,
  indexNowPayload,
  indexNowShouldRun,
  indexNowStandardKeyPath,
  indexNowUrlsForSlugs,
  notifyIndexNowBestEffort,
  shouldNotifyIndexNowForAdminAction,
  submitIndexNowUrls,
} from '@/lib/indexnow';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IndexNow', () => {
  it('stays off unless the flag is exactly 1, and never runs in tests', () => {
    expect(indexNowShouldRun({ NODE_ENV: 'production' })).toBe(false);
    vi.stubEnv('INDEXNOW_ENABLED', '1');
    expect(indexNowShouldRun({ NODE_ENV: 'test', INDEXNOW_ENABLED: '1' })).toBe(false);
    expect(indexNowShouldRun({ VITEST: 'true', INDEXNOW_ENABLED: '1' })).toBe(false);
    expect(indexNowShouldRun({ NODE_ENV: 'production', INDEXNOW_ENABLED: '1' })).toBe(true);
  });

  it('accepts only a short alphanumeric key', () => {
    expect(indexNowKey('')).toBeNull();
    expect(indexNowKey('short')).toBeNull();
    expect(indexNowKey('abcd1234')).toBe('abcd1234');
  });

  it('builds public settlement URLs and drops fictional slugs', () => {
    const urls = indexNowUrlsForSlugs(['amazon-return-policy-settlement', 'robocall-tcpa-settlement', '']);
    expect(urls.some((u) => u.endsWith('/lawsuits/amazon-return-policy-settlement'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/lawsuits'))).toBe(true);
    expect(urls.some((u) => u.includes('robocall'))).toBe(false);
  });

  it('does not submit during tests even when the flag and key are set', async () => {
    vi.stubEnv('INDEXNOW_ENABLED', '1');
    vi.stubEnv('INDEXNOW_KEY', 'abcd1234efgh');
    const fetchImpl = vi.fn();
    const result = await submitIndexNowUrls(['amazon-return-policy-settlement'], { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ submitted: 0, skipped: 'disabled' });
  });

  it('does not submit on a dry run', async () => {
    const fetchImpl = vi.fn();
    const result = await submitIndexNowUrls(['amazon-return-policy-settlement'], {
      fetchImpl,
      dryRun: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ submitted: 0, skipped: 'dry-run' });
  });

  it('shapes a valid IndexNow body from catalog URLs', () => {
    const payload = indexNowPayload(
      ['https://lawsuitai.org/lawsuits/widget-settlement'],
      'abcd1234efgh',
      'https://lawsuitai.org',
    );
    expect(payload.host).toBe('lawsuitai.org');
    expect(payload.key).toBe('abcd1234efgh');
    expect(payload.keyLocation).toBe('https://lawsuitai.org/abcd1234efgh.txt');
    expect(payload.urlList).toEqual(['https://lawsuitai.org/lawsuits/widget-settlement']);
  });

  it('POSTs a batched payload when a test supplies a mocked fetch', async () => {
    vi.stubEnv('INDEXNOW_ENABLED', '1');
    vi.stubEnv('INDEXNOW_KEY', 'abcd1234efgh');
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await submitIndexNowUrls(['amazon-return-policy-settlement'], {
      fetchImpl,
      allowInTest: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(init.body ?? '{}') as {
      host: string;
      key: string;
      keyLocation: string;
      urlList: string[];
    };
    expect(body.host).toBe('lawsuitai.org');
    expect(body.key).toBe('abcd1234efgh');
    expect(body.keyLocation).toBe('https://lawsuitai.org/abcd1234efgh.txt');
    expect(body.urlList.some((u) => u.endsWith('/lawsuits/amazon-return-policy-settlement'))).toBe(true);
    expect(result).toEqual({ submitted: expect.any(Number), status: 200 });
    expect((result as { submitted: number }).submitted).toBeGreaterThan(0);
  });

  it('swallows network errors so ingest cannot fail', async () => {
    vi.stubEnv('INDEXNOW_ENABLED', '1');
    vi.stubEnv('INDEXNOW_KEY', 'abcd1234efgh');
    const result = await notifyIndexNowBestEffort(['amazon-return-policy-settlement'], {
      fetchImpl: async () => {
        throw new Error('network down');
      },
      allowInTest: true,
    });
    expect(result).toEqual({ submitted: 0, skipped: 'error' });
  });

  it('serves the standard /{key}.txt path and notifies on publish/close', () => {
    expect(indexNowStandardKeyPath('abcd1234efgh')).toBe('/abcd1234efgh.txt');
    expect(indexNowKeyFileRequest('/abcd1234efgh.txt', 'abcd1234efgh')).toBe(true);
    expect(indexNowKeyFileRequest('/other.txt', 'abcd1234efgh')).toBe(false);
    expect(shouldNotifyIndexNowForAdminAction('publish')).toBe(true);
    expect(shouldNotifyIndexNowForAdminAction('close_missing')).toBe(true);
    expect(shouldNotifyIndexNowForAdminAction('verify')).toBe(false);
  });
});

describe('GET /indexnow-key.txt', () => {
  it('404s when the flag is off', async () => {
    vi.stubEnv('INDEXNOW_ENABLED', '');
    vi.stubEnv('INDEXNOW_KEY', 'abcd1234efgh');
    const { GET } = await import('@/app/indexnow-key.txt/route');
    const res = GET();
    expect(res.status).toBe(404);
  });
});
