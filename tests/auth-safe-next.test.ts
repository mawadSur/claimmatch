import { describe, expect, it } from 'vitest';
import {
  PENDING_NEXT_COOKIE,
  callbackDestination,
  onboardingPath,
  pendingNextCookie,
  safeNextOr,
  safeNextPath,
} from '@/lib/safe-next';

const SITE = 'https://claimmatch.vercel.app';

describe('safeNextPath', () => {
  it('keeps paths on this site, with their query and hash', () => {
    expect(safeNextPath('/claim/abc?y=1')).toBe('/claim/abc?y=1');
    expect(safeNextPath('/onboarding?next=%2Fclaim%2Fabc')).toBe('/onboarding?next=%2Fclaim%2Fabc');
    expect(safeNextPath('/dashboard#claims')).toBe('/dashboard#claims');
    expect(safeNextPath(['/claim/a', '/claim/b'])).toBe('/claim/a');
  });

  it('refuses everything that could leave the site', () => {
    for (const raw of [
      '//evil.example',
      '/\\evil.example',
      '/\\/evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/\u0000/evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'evil.example',
      '',
      `/${'a'.repeat(2048)}`,
    ]) {
      expect(safeNextPath(raw), JSON.stringify(raw)).toBeNull();
    }
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });

  it('only ever returns something the browser resolves on this site', () => {
    const tricky = ['/%5Cevil.example', '/%2F%2Fevil.example', '/ /evil.example', '/.%2E/evil', '/@evil.example', '/claim/x?next=//evil'];
    for (const raw of tricky) {
      const out = safeNextPath(raw);
      if (out !== null) expect(new URL(out, SITE).origin, raw).toBe(SITE);
    }
  });

  it('falls back when there is no safe path', () => {
    expect(safeNextOr('/\\evil.example', '/dashboard?welcome=1')).toBe('/dashboard?welcome=1');
    expect(safeNextOr('/claim/x', '/dashboard')).toBe('/claim/x');
  });
});

describe('the pending-next cookie through email confirmation', () => {
  it('is a short-lived, first-party cookie holding only the path', () => {
    expect(pendingNextCookie('/claim/x', true)).toBe(
      `${PENDING_NEXT_COOKIE}=%2Fclaim%2Fx; Path=/; Max-Age=86400; SameSite=Lax; Secure`,
    );
    expect(pendingNextCookie('/claim/x', false)).not.toContain('Secure');
  });

  it('sends the callback to onboarding, then back to the page the person started from', () => {
    expect(onboardingPath('/claim/x')).toBe('/onboarding?next=%2Fclaim%2Fx');
    expect(onboardingPath(null)).toBe('/onboarding');
    expect(callbackDestination(null, encodeURIComponent('/claim/x'))).toBe('/onboarding?next=%2Fclaim%2Fx');
    expect(callbackDestination(null, undefined)).toBe('/onboarding');
    expect(callbackDestination('/onboarding?next=%2Fclaim%2Fy', encodeURIComponent('/claim/x'))).toBe(
      '/onboarding?next=%2Fclaim%2Fy',
    );
  });

  it('ignores an unsafe or garbled cookie or query', () => {
    expect(callbackDestination(null, encodeURIComponent('//evil.example'))).toBe('/onboarding');
    expect(callbackDestination(null, encodeURIComponent('/\\evil.example'))).toBe('/onboarding');
    expect(callbackDestination(null, '%E0%A4%A')).toBe('/onboarding');
    expect(callbackDestination('/\\evil.example', undefined)).toBe('/onboarding');
  });
});
