import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/analytics/view/route';
import {
  distinctIdFromCookieHeader,
  isViewEvent,
  shouldRecordView,
  viewEventKey,
  viewProperties,
} from '@/lib/analytics/view-capture';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('view event helpers', () => {
  it('allowlists only landing_viewed and settlement_viewed', () => {
    expect(isViewEvent('landing_viewed')).toBe(true);
    expect(isViewEvent('settlement_viewed')).toBe(true);
    expect(isViewEvent('$pageview')).toBe(false);
    expect(isViewEvent('signup_started')).toBe(false);
  });

  it('skips bots and unknown events', () => {
    expect(shouldRecordView({ event: 'landing_viewed', userAgent: 'Mozilla/5.0' }).ok).toBe(true);
    expect(shouldRecordView({ event: 'landing_viewed', userAgent: 'GPTBot' }).ok).toBe(false);
    expect(shouldRecordView({ event: 'signup_started', userAgent: 'Mozilla/5.0' }).ok).toBe(false);
  });

  it('reads the PostHog distinct id from the cookie', () => {
    const key = 'phc_test';
    const cookie = `ph_${key}_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'abc-123' }))}`;
    expect(distinctIdFromCookieHeader(cookie, key)).toBe('abc-123');
    expect(distinctIdFromCookieHeader('other=1', key)).toBeNull();
  });

  it('builds a once-per-view key and PII-free properties', () => {
    expect(viewEventKey('settlement_viewed', '/lawsuits/foo', 'foo')).toBe('settlement_viewed:/lawsuits/foo:foo');
    expect(viewProperties({ path: '/lawsuits/foo', slug: 'foo', lawsuitId: 'id-1' })).toEqual({
      path: '/lawsuits/foo',
      slug: 'foo',
      lawsuit_id: 'id-1',
    });
  });
});

describe('/api/analytics/view', () => {
  it('accepts a landing_viewed beacon and skips unknown events', async () => {
    const ok = await POST(
      new Request('https://lawsuitai.org/api/analytics/view', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
        body: JSON.stringify({ event: 'landing_viewed', path: '/' }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });

    const skipped = await GET(
      new Request('https://lawsuitai.org/api/analytics/view?event=signup_started', {
        headers: { 'user-agent': 'Mozilla/5.0' },
      }),
    );
    expect(skipped.status).toBe(200);
    expect(await skipped.json()).toMatchObject({ ok: true, skipped: 'unknown_event' });
  });
});
