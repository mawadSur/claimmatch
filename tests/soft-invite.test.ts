import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { inviteRefFromSearch, inviteSignupHref, isInviteLandingEnabled } from '@/lib/soft-invite';
import { SHARE_LINK_DESTINATIONS, isShareLinkDestination, sanitizeDestination } from '@/lib/share-links';
import { flags } from '@/lib/flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('soft-invite landing flag', () => {
  it('is off by default and 404s unless the env var is exactly 1', () => {
    expect(flags.softInviteLanding()).toBe(false);
    expect(isInviteLandingEnabled()).toBe(false);
    vi.stubEnv('SOFT_INVITE_LANDING_ENABLED', 'true');
    expect(isInviteLandingEnabled()).toBe(false);
    vi.stubEnv('SOFT_INVITE_LANDING_ENABLED', '1');
    expect(isInviteLandingEnabled()).toBe(true);
  });

  it('gates /invite with notFound when the flag is off', () => {
    const source = readFileSync('src/app/invite/page.tsx', 'utf8');
    expect(source).toContain('isInviteLandingEnabled()');
    expect(source).toContain('notFound()');
    expect(source).toContain('index: false');
  });
});

describe('invite signup CTA', () => {
  it('preserves safe next, ref, and UTMs already used by attribution', () => {
    expect(inviteSignupHref('')).toBe('/signup');
    expect(inviteSignupHref('utm_source=twitter&ref=soft-1&next=/dashboard')).toBe(
      '/signup?utm_source=twitter&ref=soft-1&next=%2Fdashboard',
    );
    expect(inviteSignupHref('next=https://evil.example&utm_medium=email')).toBe('/signup?utm_medium=email');
  });

  it('maps /invite?code= to signup ref so first-touch survives the hop', () => {
    expect(inviteSignupHref('code=tester-ada')).toBe('/signup?ref=tester-ada');
    expect(inviteSignupHref('code=tester-ada&ref=other')).toBe('/signup?ref=other');
    expect(inviteRefFromSearch(new URLSearchParams('code=tester-ada'), false)).toBeNull();
    expect(inviteRefFromSearch(new URLSearchParams('code=tester-ada'), true)).toBe('tester-ada');
  });
});

describe('share-link destinations', () => {
  it('allows /invite as a tracked destination', () => {
    expect(SHARE_LINK_DESTINATIONS).toContain('/invite');
    expect(isShareLinkDestination('/invite')).toBe(true);
    expect(sanitizeDestination('/invite')).toBe('/invite');
  });
});
