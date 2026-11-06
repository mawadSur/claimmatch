import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  indexNowKey,
  indexNowPayload,
  indexNowShouldRun,
  indexNowUrlsForSlugs,
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
    expect(payload.keyLocation).toBe('https://lawsuitai.org/indexnow-key.txt');
    expect(payload.urlList).toEqual(['https://lawsuitai.org/lawsuits/widget-settlement']);
  });
});
