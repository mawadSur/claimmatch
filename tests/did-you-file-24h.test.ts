import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DID_YOU_FILE_24H_AFTER_MS,
  DID_YOU_FILE_24H_KIND,
  pickDidYouFile24h,
  sendDidYouFile24hEmails,
} from '@/lib/did-you-file-24h';
import { issueFiledToken, parseFiledToken, resolveFiledView } from '@/lib/filed-link';
import { applyFiledToken } from '@/lib/apply-filed';
import { persistOfficialFormOpen, shouldPersistOfficialFormOpen } from '@/lib/official-form-opens';
import { renderDidYouFile24hEmail } from '@/lib/email';
import { flags } from '@/lib/flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

const now = new Date('2026-11-27T12:00:00.000Z');
const opened25hAgo = new Date(now.getTime() - DID_YOU_FILE_24H_AFTER_MS - 60_000).toISOString();
const opened1hAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

describe('DID_YOU_FILE_EMAIL_ENABLED', () => {
  it('defaults off and skips persist + cron', async () => {
    expect(flags.didYouFileEmail()).toBe(false);
    expect(shouldPersistOfficialFormOpen()).toBe(false);
    expect(await persistOfficialFormOpen({ userId: 'u', lawsuitId: 'l' })).toEqual({
      persisted: false,
      reason: 'flag_off',
    });
    expect(await sendDidYouFile24hEmails({ now })).toEqual({
      candidates: 0,
      emailed: 0,
      skipped: 'DID_YOU_FILE_EMAIL_ENABLED is off',
    });
    expect(await applyFiledToken('not-a-token')).toEqual({
      ok: false,
      status: 404,
      error: 'This link is not available.',
    });
  });

  it('picks one unfiled self-file 24h after the first official-form open', () => {
    const base = {
      userId: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
      claimId: 'claim-1',
      lawsuitId: 'suit-1',
      status: 'self_file',
      slug: 'acme',
      title: 'Acme settlement',
      deadline: '2099-01-01',
      openedAt: opened25hAgo,
      alreadySent: false,
    };
    expect(pickDidYouFile24h(base, now)).toMatchObject({
      userId: 'user-1',
      lawsuitId: 'suit-1',
      claimId: 'claim-1',
    });
    expect(pickDidYouFile24h({ ...base, alreadySent: true }, now)).toBeNull();
    expect(pickDidYouFile24h({ ...base, status: 'reported_filed' }, now)).toBeNull();
    expect(pickDidYouFile24h({ ...base, openedAt: opened1hAgo }, now)).toBeNull();
    expect(pickDidYouFile24h({ ...base, deadline: '2020-01-01' }, now)).toBeNull();
  });

  it('dedupes per user+settlement via drip kind did_you_file_24h', () => {
    expect(DID_YOU_FILE_24H_KIND).toBe('did_you_file_24h');
  });
});

describe('one-click filed link', () => {
  const secret = 'test-filed-secret';
  const ids = {
    userId: '00000000-0000-4000-8000-000000000001',
    lawsuitId: '00000000-0000-4000-8000-000000000002',
    claimId: '00000000-0000-4000-8000-000000000003',
  };

  it('round-trips a signed token and expires', () => {
    const issued = issueFiledToken({ ...ids, secret, now });
    expect(parseFiledToken(issued.token, secret, now)).toMatchObject({ ok: true, ...ids });
    const later = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(parseFiledToken(issued.token, secret, later)).toEqual({ ok: false, error: 'expired' });
    expect(parseFiledToken(issued.token, 'other', now)).toEqual({ ok: false, error: 'bad_signature' });
  });

  it('GET confirm view does not treat a missing token as done', () => {
    expect(resolveFiledView({}, secret, now).kind).toBe('missing');
    const issued = issueFiledToken({ ...ids, secret, now });
    expect(resolveFiledView({ t: issued.token }, secret, now)).toEqual({
      kind: 'confirm',
      token: issued.token,
    });
  });
});

describe('24h did-you-file email copy', () => {
  it('uses a one-click filed URL and does not invent payouts', () => {
    const html = renderDidYouFile24hEmail({
      title: 'Acme settlement',
      slug: 'acme',
      filedUrl: 'https://lawsuitai.org/filed?t=abc',
      to: 'ada@example.com',
    });
    expect(html).toContain('https://lawsuitai.org/filed?t=abc');
    expect(html).toContain('Acme settlement');
    expect(html).toContain('Filing on the official site is always free');
    expect(html).not.toMatch(/\$\d/);
    expect(html).toContain('Unsubscribe');
  });
});
