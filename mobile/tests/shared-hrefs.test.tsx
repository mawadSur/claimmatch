import {
  claimHref,
  isClaimHref,
  loginHref,
  safeNextPath,
  settlementHref,
  signupHref,
} from '@/features/shared/hrefs';
import { toSafeWebUrl } from '@/lib/external-link';

describe('claim hrefs', () => {
  it('accepts only "/claim/{slug}" with a lowercase slug', () => {
    expect(isClaimHref('/claim/acme-data-breach-2026')).toBe(true);
    for (const value of [
      '/claim/',
      '/claim/Acme',
      '/claim/acme/extra',
      '/claim/acme?next=x',
      '/claim/../settings',
      '/lawsuits/acme',
      'claim/acme',
      'https://lawsuitai.org/claim/acme',
      '//evil.example/claim/acme',
      42,
      null,
      undefined,
    ]) {
      expect(isClaimHref(value)).toBe(false);
    }
  });

  it('builds claim and settlement paths with the slug encoded', () => {
    expect(claimHref('acme-data-breach')).toBe('/claim/acme-data-breach');
    expect(claimHref('a/b?c')).toBe('/claim/a%2Fb%3Fc');
    expect(isClaimHref(claimHref('a/b?c'))).toBe(false);
    expect(settlementHref('acme-data-breach')).toBe('/lawsuits/acme-data-breach');
  });
});

describe('safeNextPath', () => {
  it('keeps the claim, settlement and tab screens', () => {
    for (const path of [
      '/claim/acme',
      '/lawsuits',
      '/lawsuits/acme',
      '/dashboard',
      '/settings',
      '/settings/details',
      '/settings/legal',
    ]) {
      expect(safeNextPath(path)).toBe(path);
    }
    expect(safeNextPath(['/dashboard', '/settings'])).toBe('/dashboard');
  });

  it('drops anything else, including the web safe-next bypasses', () => {
    for (const value of [
      '',
      '/',
      '//evil.example',
      '/\\evil.example',
      '/%5Cevil.example',
      '/..//evil.example',
      'https://evil.example',
      'mailto:a@b.c',
      '/dashboard?welcome=1',
      '/claim/acme#x',
      '/delete-account',
      '/onboarding',
      '/settings/other',
      42,
      null,
      undefined,
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it('carries a checked next path to the auth screens', () => {
    expect(loginHref('/claim/acme')).toEqual({ pathname: '/login', params: { next: '/claim/acme' } });
    expect(signupHref('/dashboard')).toEqual({ pathname: '/signup', params: { next: '/dashboard' } });
    expect(loginHref('https://evil.example')).toBe('/login');
    expect(signupHref(null)).toBe('/signup');
  });
});

describe('toSafeWebUrl', () => {
  it('opens websites over https only: an http link is opened as https', () => {
    expect(toSafeWebUrl('https://www.acmesettlement.com/claim?id=1#form')).toBe('https://www.acmesettlement.com/claim?id=1#form');
    expect(toSafeWebUrl(' http://example.org/x ')).toBe('https://example.org/x');
    expect(toSafeWebUrl('HTTP://Example.org')).toBe('https://example.org/');
    expect(toSafeWebUrl('http://example.org:80/a')).toBe('https://example.org/a');
  });

  it('refuses a link with a user name or password, and anything that is not a website', () => {
    for (const value of [
      'https://user:pw@example.org/',
      'https://official-site.com@evil.example/claim',
      'javascript:alert(1)',
      'file:///etc/hosts',
      'intent://x#Intent;end',
      'claimmatch://claim/acme',
      'tel:+18005550100',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(toSafeWebUrl(value)).toBeNull();
    }
  });
});
