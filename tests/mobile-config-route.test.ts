import { afterEach, describe, expect, it, vi } from 'vitest';

// The config answers signed-out callers and reads no data.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('the app config needs no session');
  },
  createServiceClient: () => {
    throw new Error('the app config reads no data');
  },
}));

import { GET } from '@/app/api/mobile/config/route';
import { APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER, LEGAL_DISCLAIMER, SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { CLIENT_FLAG_NAMES } from '@/lib/flags';
import { MOBILE_API_VERSION, type ClientConfig } from '@/lib/mobile-contract';
import { GUIDED_SLUGS, SETTLEMENT_GUIDES, SETTLEMENT_GUIDES_VERSION, guidesVersion } from '@/lib/settlement-guides';

async function config(query = ''): Promise<{ res: Response; body: ClientConfig; bytes: number }> {
  const res = await GET(new Request(`http://localhost/api/mobile/config${query}`));
  const text = await res.text();
  return { res, body: JSON.parse(text) as ClientConfig, bytes: Buffer.byteLength(text) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GET /api/mobile/config', () => {
  it('sends only the allow-listed flags, as booleans that follow the environment', async () => {
    for (const name of CLIENT_FLAG_NAMES) vi.stubEnv(name, '');
    vi.stubEnv('MATCH_EMAILS_ENABLED', '1');
    vi.stubEnv('DIRECT_FILING_ENABLED', '1');

    const off = (await config()).body;
    expect(Object.keys(off.flags).sort()).toEqual([...CLIENT_FLAG_NAMES].sort());
    expect(Object.values(off.flags).every((value) => value === false)).toBe(true);

    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    vi.stubEnv('FEE_DISCLOSURE_ENABLED', 'true');
    const on = (await config()).body;
    expect(on.flags).toMatchObject({
      ASSISTED_FILING_ENABLED: true,
      VERIFIED_FIELDS_ENABLED: true,
      FEE_DISCLOSURE_ENABLED: false,
    });
    expect(Object.values(on.flags).every((value) => typeof value === 'boolean')).toBe(true);
    expect(JSON.stringify(on)).not.toMatch(/MATCH_EMAILS|DIRECT_FILING/);
  });

  it('serves the app wording of the legal text and the contact inbox', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'privacy@lawsuitai.org');
    expect((await config()).body.legal).toEqual({
      disclaimer: APP_LEGAL_DISCLAIMER,
      short: APP_SHORT_DISCLAIMER,
      contactEmail: 'privacy@lawsuitai.org',
    });
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', '{CONTACT_EMAIL}');
    expect((await config()).body.legal.contactEmail).toBeNull();
  });

  it('is never stored by a cache', async () => {
    const { res } = await config();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toBe('Authorization, Cookie');
  });

  it('reports the API version, the server clock and today in the deadline zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T02:00:00Z'));
    const { body } = await config();
    expect(body.apiVersion).toBe(MOBILE_API_VERSION);
    expect(body.apiVersion).toBe(1);
    expect(body.serverTime).toBe('2026-10-16T02:00:00.000Z');
    // 10 p.m. on Oct 15 in New York.
    expect(body.todayDeadlineZone).toBe('2026-10-15');
  });

  it('reads the minimum builds, and a blank or malformed value means no minimum', async () => {
    vi.stubEnv('MOBILE_MIN_BUILD_IOS', '');
    vi.stubEnv('MOBILE_MIN_BUILD_ANDROID', '');
    expect((await config()).body.minBuild).toEqual({ ios: 0, android: 0 });

    vi.stubEnv('MOBILE_MIN_BUILD_IOS', '42');
    vi.stubEnv('MOBILE_MIN_BUILD_ANDROID', ' 17 ');
    expect((await config()).body.minBuild).toEqual({ ios: 42, android: 17 });

    for (const bad of ['abc', '-3', '1.5', '12abc', '9'.repeat(400)]) {
      vi.stubEnv('MOBILE_MIN_BUILD_IOS', bad);
      expect((await config()).body.minBuild.ios, bad).toBe(0);
    }
  });
});

describe('the official-notice guides (the app’s catalog and settlement screens overlay them)', () => {
  /** Every field of a SettlementGuide; the ones the overlay always needs come first. */
  const REQUIRED = ['slugs', 'officialUrl', 'sourceChecked', 'eligibilityText', 'typicalPayout', 'deadline', 'proof', 'proofDetail'];
  const OPTIONAL = ['administrator', 'summary', 'description', 'extraFaqs'];

  it('serves each guide once, listing every slug it covers, with the version of the list', async () => {
    const { body } = await config();
    expect(body.guides).toEqual(SETTLEMENT_GUIDES);
    expect(body.guidesVersion).toBe(SETTLEMENT_GUIDES_VERSION);
    // What the app reads hashes to the version it is sent with.
    expect(guidesVersion(body.guides ?? [])).toBe(body.guidesVersion);
    // Aliases share one entry, so its long texts are sent once.
    const slugs = (body.guides ?? []).flatMap((guide) => guide.slugs);
    expect([...slugs].sort()).toEqual([...GUIDED_SLUGS].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('carries the facts the overlay reads and no other field', async () => {
    const { body } = await config();
    for (const guide of body.guides ?? []) {
      for (const key of REQUIRED) expect(guide, `${guide.slugs[0]} ${key}`).toHaveProperty(key);
      expect(Object.keys(guide).filter((key) => !REQUIRED.includes(key) && !OPTIONAL.includes(key))).toEqual([]);
      expect(guide.officialUrl).toMatch(/^https:\/\//);
      expect(guide.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('leaves the list out when the app already has that version, and sends it for any other', async () => {
    const same = await config(`?guides=${SETTLEMENT_GUIDES_VERSION}`);
    expect(same.body.guidesVersion).toBe(SETTLEMENT_GUIDES_VERSION);
    expect(same.body).not.toHaveProperty('guides');
    for (const other of ['', 'old1', `${SETTLEMENT_GUIDES_VERSION}0`, 'x'.repeat(300)]) {
      expect((await config(`?guides=${encodeURIComponent(other)}`)).body.guides, other).toEqual(SETTLEMENT_GUIDES);
    }
  });

  it('stays small: the list is under 32 KB, and a config without it under 4 KB', async () => {
    const full = await config();
    const lean = await config(`?guides=${SETTLEMENT_GUIDES_VERSION}`);
    expect(Buffer.byteLength(JSON.stringify(SETTLEMENT_GUIDES))).toBeLessThan(32_000);
    expect(lean.bytes).toBeLessThan(4_000);
    expect(full.bytes - lean.bytes).toBe(Buffer.byteLength(`,"guides":${JSON.stringify(SETTLEMENT_GUIDES)}`));
  });

  it('only adds fields: everything an older app build reads is still there, under API version 1', async () => {
    const { body } = await config();
    expect(Object.keys(body).sort()).toEqual(
      ['apiVersion', 'flags', 'guides', 'guidesVersion', 'legal', 'minBuild', 'serverTime', 'todayDeadlineZone'],
    );
    expect(body.apiVersion).toBe(1);
  });
});

describe('the app wording of the disclaimers', () => {
  it('is the website text with only "this website" and "this site" changed', () => {
    expect(APP_LEGAL_DISCLAIMER).toBe(
      LEGAL_DISCLAIMER.replace('The information on this website', 'The information on Lawsuit AI').replace(
        'Using this website or contacting us',
        'Using this app or contacting us',
      ),
    );
    expect(APP_SHORT_DISCLAIMER).toBe(SHORT_DISCLAIMER.replace('Using this site', 'Using this app'));
  });

  it('never calls the app a website or a site, while the website keeps its own text', () => {
    for (const text of [APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER]) {
      expect(text).not.toMatch(/\bthis (web)?site\b/i);
    }
    expect(LEGAL_DISCLAIMER).toContain('The information on this website is general information');
    expect(LEGAL_DISCLAIMER).toContain('Using this website or contacting us');
    expect(SHORT_DISCLAIMER).toContain('Using this site does not create');
  });
});
