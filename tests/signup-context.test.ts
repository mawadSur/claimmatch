import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimReturnPath, isClaimReturnPath, signedOutClaimHref } from '@/lib/signup-context';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('signup return path', () => {
  it('accepts only a same-site /claim/{slug} path', () => {
    expect(isClaimReturnPath('/claim/real-settlement')).toBe(true);
    expect(claimReturnPath('real-settlement')).toBe('/claim/real-settlement');
    expect(isClaimReturnPath('/claim/real-settlement?x=1')).toBe(true);
    expect(isClaimReturnPath('/dashboard')).toBe(false);
    expect(isClaimReturnPath('//evil.example')).toBe(false);
    expect(isClaimReturnPath('/\\evil.example')).toBe(false);
    expect(isClaimReturnPath('https://evil.example/claim/x')).toBe(false);
    expect(claimReturnPath('../claim/x')).toBeNull();
  });

  it('sends signed-out claim visits to signup only when the flag is exactly 1', () => {
    expect(signedOutClaimHref('/claim/real-settlement')).toBe(
      '/login?next=%2Fclaim%2Freal-settlement',
    );
    vi.stubEnv('SIGNUP_CONTEXT_ENABLED', '1');
    expect(signedOutClaimHref('/claim/real-settlement')).toBe(
      '/signup?next=%2Fclaim%2Freal-settlement',
    );
    expect(signedOutClaimHref('/dashboard')).toBe('/login?next=%2Fdashboard');
    expect(signedOutClaimHref('/\\evil.example')).toBe('/login');
  });
});
