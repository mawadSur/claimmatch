import { describe, expect, it } from 'vitest';
import {
  attributionMetadata,
  attributionPersonProperties,
  attributionQuery,
  attributionSearch,
  doNotTrackEnabled,
  EMPTY_ATTRIBUTION,
  firstTouch,
  hasAttribution,
  parseAttrCookie,
  parseAttribution,
  sanitizeRef,
  sanitizeUtm,
  serializeAttrCookie,
} from '@/lib/attribution';
import {
  joinOrigin,
  PERSONAL_REFERRAL_UTM,
  resolveShareRedirect,
  sanitizeDestination,
  trackedCampaignUrl,
} from '@/lib/share-links';
import { posthogApiHost, posthogAssetHost, posthogRewrites } from '@/lib/posthog-proxy';

describe('attribution parsing', () => {
  it('keeps utm_* and ref, and strips junk', () => {
    const attr = parseAttribution({
      utm_source: ' twitter ',
      utm_medium: 'social!',
      utm_campaign: 'launch-1',
      utm_content: 'bio_link',
      ref: 'ab/c d',
      extra: 'ignore',
    });
    expect(attr).toEqual({
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: 'launch-1',
      utm_content: 'bio_link',
      ref: 'abcd',
    });
  });

  it('treats first-touch as sticky', () => {
    const first = parseAttribution({ utm_source: 'twitter', ref: 'aaa' });
    const later = parseAttribution({ utm_source: 'facebook', utm_medium: 'cpc', ref: 'bbb' });
    expect(firstTouch(first, later)).toEqual({
      utm_source: 'twitter',
      utm_medium: 'cpc',
      utm_campaign: null,
      utm_content: null,
      ref: 'aaa',
    });
  });

  it('round-trips the UTM cookie without the ref', () => {
    const attr = parseAttribution({ utm_source: 'newsletter', utm_campaign: 'oct' });
    expect(parseAttrCookie(serializeAttrCookie(attr)).utm_source).toBe('newsletter');
    expect(parseAttrCookie('not-json')).toEqual(EMPTY_ATTRIBUTION);
  });

  it('builds query strings and signup metadata without empty keys', () => {
    const attr = parseAttribution({ utm_source: 'twitter', ref: 'abc12' });
    expect(attributionSearch(attr)).toBe('?utm_source=twitter&ref=abc12');
    expect(Object.fromEntries(attributionQuery(attr))).toEqual({
      utm_source: 'twitter',
      ref: 'abc12',
    });
    expect(attributionMetadata(attr)).toEqual({ utm_source: 'twitter', ref: 'abc12' });
    expect(hasAttribution(EMPTY_ATTRIBUTION)).toBe(false);
  });

  it('sets PostHog person properties without PII keys', () => {
    const props = attributionPersonProperties(
      parseAttribution({ utm_source: 'twitter', ref: 'abc12' }),
    );
    expect(props.utm_source).toBe('twitter');
    expect(props.$initial_utm_source).toBe('twitter');
    expect(props.ref).toBe('abc12');
    expect(JSON.stringify(props)).not.toMatch(/email|full_name|phone/i);
  });

  it('respects Do Not Track flags', () => {
    expect(doNotTrackEnabled({ doNotTrack: '1' })).toBe(true);
    expect(doNotTrackEnabled({ doNotTrack: '0' }, '1')).toBe(true);
    expect(doNotTrackEnabled({ doNotTrack: '0' })).toBe(false);
    expect(sanitizeUtm('bad value!')).toBe('badvalue');
    expect(sanitizeRef('x y/z')).toBe('xyz');
  });
});

describe('share-link redirects', () => {
  it('expands a campaign code to the destination with stored UTMs and ref', () => {
    const resolved = resolveShareRedirect({
      code: 'tw1',
      origin: 'https://claimmatch.vercel.app',
      incoming: EMPTY_ATTRIBUTION,
      shareLink: {
        code: 'tw1',
        destination: '/',
        utm_source: 'twitter',
        utm_medium: 'social',
        utm_campaign: 'launch',
        utm_content: 'bio',
        label: 'Twitter',
      },
      isPersonalReferral: false,
    });
    expect(resolved?.logClick).toBe(true);
    expect(resolved?.url).toBe(
      'https://claimmatch.vercel.app/?utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_content=bio&ref=tw1',
    );
  });

  it('keeps incoming UTMs on a personal referral all the way to /signup', () => {
    const resolved = resolveShareRedirect({
      code: 'user10char',
      origin: 'https://claimmatch.vercel.app',
      incoming: parseAttribution({ utm_source: 'newsletter', utm_medium: 'email' }),
      shareLink: null,
      isPersonalReferral: true,
    });
    expect(resolved?.url).toContain('/signup?');
    expect(resolved?.url).toContain('utm_source=newsletter');
    expect(resolved?.url).toContain('utm_medium=email');
    expect(resolved?.url).toContain('utm_campaign=personal');
    expect(resolved?.url).toContain('ref=user10char');
  });

  it('fills personal-referral UTM defaults when the request has none', () => {
    const resolved = resolveShareRedirect({
      code: 'user10char',
      origin: 'https://claimmatch.vercel.app',
      incoming: EMPTY_ATTRIBUTION,
      shareLink: null,
      isPersonalReferral: true,
    });
    expect(resolved?.attribution).toMatchObject({
      ...PERSONAL_REFERRAL_UTM,
      ref: 'user10char',
    });
  });

  it('does not drop UTMs for an unknown code', () => {
    const resolved = resolveShareRedirect({
      code: 'unknown1',
      origin: 'https://claimmatch.vercel.app',
      incoming: parseAttribution({ utm_source: 'ads', ref: 'ignored' }),
      shareLink: null,
      isPersonalReferral: false,
    });
    expect(resolved?.logClick).toBe(false);
    expect(resolved?.url).toContain('/signup?');
    expect(resolved?.url).toContain('utm_source=ads');
    expect(resolved?.url).toContain('ref=unknown1');
  });

  it('rejects off-site destinations', () => {
    expect(sanitizeDestination('https://evil.example')).toBe('/');
    expect(sanitizeDestination('//evil.example')).toBe('/');
    expect(sanitizeDestination('/lawsuits?q=1')).toBe('/lawsuits?q=1');
    expect(trackedCampaignUrl('https://claimmatch.vercel.app', '/', parseAttribution({ ref: 'ab' }))).toBe(
      'https://claimmatch.vercel.app/?ref=ab',
    );
    expect(joinOrigin('https://x.test', '/signup', parseAttribution({ ref: 'z' }))).toContain('ref=z');
  });
});

describe('PostHog reverse proxy', () => {
  it('maps /ingest to the regional ingest host', () => {
    expect(posthogApiHost('https://us.i.posthog.com')).toBe('https://us.i.posthog.com');
    expect(posthogApiHost('https://us.posthog.com')).toBe('https://us.i.posthog.com');
    expect(posthogAssetHost('https://us.i.posthog.com')).toBe('https://us-assets.i.posthog.com');
    const rules = posthogRewrites('https://us.i.posthog.com');
    expect(rules[0]).toEqual({
      source: '/ingest/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    });
    expect(rules[1]).toEqual({
      source: '/ingest/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    });
  });
});
