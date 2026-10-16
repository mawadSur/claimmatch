import { describe, expect, it } from 'vitest';
import {
  encodeUnsubscribeToken,
  pageLocationForGet,
  resolveUnsubscribeView,
  unsubscribeBackendProblem,
  unsubscribeResultPath,
} from '@/lib/unsubscribe';

const BULLETS = String.fromCodePoint(0x2022).repeat(3);
const EMAIL = 'Jane@Example.com';
const TOKEN = encodeUnsubscribeToken(EMAIL);

describe('resolveUnsubscribeView', () => {
  it('shows the confirm step for a valid token, with the address masked', () => {
    expect(resolveUnsubscribeView({ e: TOKEN })).toEqual({
      kind: 'confirm',
      token: TOKEN,
      maskedEmail: `J${BULLETS}@example.com`,
    });
  });

  it('re-encodes the token instead of echoing what came in', () => {
    const view = resolveUnsubscribeView({ e: `  ${TOKEN}==\n` });
    expect(view).toMatchObject({ kind: 'confirm', token: TOKEN });
  });

  it('never puts the full address in the view', () => {
    expect(JSON.stringify(resolveUnsubscribeView({ e: TOKEN }))).not.toContain(EMAIL);
  });

  it('explains a broken link', () => {
    expect(resolveUnsubscribeView({ e: 'not a token!' })).toEqual({ kind: 'invalid' });
    expect(resolveUnsubscribeView({ error: 'invalid' })).toEqual({ kind: 'invalid' });
  });

  it('confirms success, even if a token is still present', () => {
    expect(resolveUnsubscribeView({ done: '1' })).toEqual({ kind: 'done' });
    expect(resolveUnsubscribeView({ done: '1', e: TOKEN })).toEqual({ kind: 'done' });
  });

  it('reopens the confirm step with a notice after a retryable error', () => {
    expect(resolveUnsubscribeView({ e: TOKEN, error: 'failed' })).toMatchObject({
      kind: 'confirm',
      notice: 'failed',
    });
    expect(resolveUnsubscribeView({ e: TOKEN, error: 'busy' })).toMatchObject({
      kind: 'confirm',
      notice: 'busy',
    });
  });

  it('ignores unknown error codes', () => {
    expect(resolveUnsubscribeView({ e: TOKEN, error: '<script>' })).not.toHaveProperty('notice');
  });

  it('shows a failure without a token, including the old done=0 redirect', () => {
    expect(resolveUnsubscribeView({ error: 'failed' })).toEqual({ kind: 'failed' });
    expect(resolveUnsubscribeView({ error: 'busy' })).toEqual({ kind: 'failed' });
    expect(resolveUnsubscribeView({ done: '0' })).toEqual({ kind: 'failed' });
  });

  it('explains how to unsubscribe when the page has no token', () => {
    expect(resolveUnsubscribeView({})).toEqual({ kind: 'missing' });
    expect(resolveUnsubscribeView({ e: '' })).toEqual({ kind: 'missing' });
  });

  it('uses the first value of a repeated parameter', () => {
    expect(resolveUnsubscribeView({ e: [TOKEN, 'junk'] })).toMatchObject({ kind: 'confirm' });
    expect(resolveUnsubscribeView({ done: ['1', '0'] })).toEqual({ kind: 'done' });
  });
});

describe('unsubscribeResultPath', () => {
  it('maps each outcome to a page path', () => {
    expect(unsubscribeResultPath('done')).toBe('/unsubscribe?done=1');
    expect(unsubscribeResultPath('invalid')).toBe('/unsubscribe?error=invalid');
    expect(unsubscribeResultPath('invalid', EMAIL)).toBe('/unsubscribe?error=invalid');
    expect(unsubscribeResultPath('failed', EMAIL)).toBe(`/unsubscribe?e=${TOKEN}&error=failed`);
    expect(unsubscribeResultPath('busy', EMAIL)).toBe(`/unsubscribe?e=${TOKEN}&error=busy`);
    expect(unsubscribeResultPath('failed')).toBe('/unsubscribe?error=failed');
  });

  it('round-trips through the page view', () => {
    const url = new URL(unsubscribeResultPath('failed', EMAIL), 'https://x.test');
    expect(resolveUnsubscribeView(Object.fromEntries(url.searchParams))).toMatchObject({
      kind: 'confirm',
      token: TOKEN,
      notice: 'failed',
    });
  });

  it('never puts the plain address in the path', () => {
    for (const outcome of ['done', 'invalid', 'failed', 'busy'] as const) {
      expect(unsubscribeResultPath(outcome, EMAIL)).not.toContain(EMAIL);
      expect(unsubscribeResultPath(outcome, EMAIL)).not.toContain('@');
    }
  });
});

describe('pageLocationForGet', () => {
  it('sends a bare GET to the page', () => {
    expect(pageLocationForGet(null)).toBe('/unsubscribe');
    expect(pageLocationForGet('')).toBe('/unsubscribe');
  });

  it('keeps a valid token, normalized', () => {
    expect(pageLocationForGet(TOKEN)).toBe(`/unsubscribe?e=${TOKEN}`);
    expect(pageLocationForGet(`${TOKEN}==`)).toBe(`/unsubscribe?e=${TOKEN}`);
  });

  it('does not reflect a bad token', () => {
    expect(pageLocationForGet('https://evil.test/<x>')).toBe('/unsubscribe?error=invalid');
  });
});

describe('unsubscribeBackendProblem', () => {
  it('needs the Supabase URL and the service role key', () => {
    expect(unsubscribeBackendProblem({})).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(unsubscribeBackendProblem({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toMatch(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(
      unsubscribeBackendProblem({
        NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
      }),
    ).toBeNull();
  });
});
