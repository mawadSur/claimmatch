import { describe, expect, it } from 'vitest';
import {
  detectTrafficKind,
  hasStrayQuote,
  isMalformedApiPath,
  parseTrafficQuery,
  shouldCapturePageview,
} from '@/lib/analytics/traffic';
import {
  filingConfirmedProperties,
  matchesViewedProperties,
  profileCompletedProperties,
} from '@/lib/analytics/events';

describe('traffic kind', () => {
  it('tags Playwright and Lawsuit AI smoke as test, not product', () => {
    expect(detectTrafficKind({ userAgent: 'ClaimMatchSmoke/1.0' })).toBe('test');
    expect(detectTrafficKind({ userAgent: 'Mozilla/5.0 Playwright' })).toBe('test');
    expect(detectTrafficKind({ webdriver: true, userAgent: 'Chrome' })).toBe('test');
  });

  it('tags known agents and curl as bot', () => {
    expect(detectTrafficKind({ userAgent: 'claude-code/2.1.131 (cli)' })).toBe('bot');
    expect(detectTrafficKind({ userAgent: 'compatible; Claude-User/1.0; +Claude-User@anthropic.com' })).toBe(
      'bot',
    );
    expect(detectTrafficKind({ userAgent: 'compatible; Perplexity-User/1.0' })).toBe('bot');
    expect(detectTrafficKind({ userAgent: 'curl/8.5.0' })).toBe('bot');
  });

  it('accepts only the closed-set cm_traffic query values', () => {
    expect(parseTrafficQuery('test')).toBe('test');
    expect(parseTrafficQuery('internal')).toBe('internal');
    expect(parseTrafficQuery('bot')).toBe('bot');
    expect(parseTrafficQuery('product')).toBeNull();
    expect(parseTrafficQuery('google')).toBeNull();
    expect(detectTrafficKind({ searchParam: 'test', userAgent: 'Safari' })).toBe('test');
    expect(detectTrafficKind({ searchParam: 'utm_source', userAgent: 'Safari' })).toBe('product');
  });

  it('lets internal win over user agent', () => {
    expect(detectTrafficKind({ internal: true, userAgent: 'ClaimMatchSmoke/1.0' })).toBe('internal');
  });
});

describe('pageview allow list', () => {
  it('skips API, health, and quoted paths so monitoring 404s are not pageviews', () => {
    expect(shouldCapturePageview('/')).toBe(true);
    expect(shouldCapturePageview('/lawsuits')).toBe(true);
    expect(shouldCapturePageview('/api/health/schema')).toBe(false);
    expect(shouldCapturePageview("/api/health/schema'")).toBe(false);
    expect(shouldCapturePageview('/api/health/schema%27')).toBe(false);
    expect(shouldCapturePageview('/api/cron/daily')).toBe(false);
    expect(hasStrayQuote("/api/health/schema'")).toBe(true);
    expect(isMalformedApiPath("/api/health/schema'")).toBe(true);
    expect(isMalformedApiPath('/api/health/schema')).toBe(false);
    expect(isMalformedApiPath('/lawsuits')).toBe(false);
  });
});

describe('milestone evidence', () => {
  it('does not invent profile completion without name or state', () => {
    expect(profileCompletedProperties({ hasName: false, hasState: false })).toBeNull();
    expect(profileCompletedProperties({ hasName: true, hasState: false })).toMatchObject({
      evidence: 'onboarding_saved',
      has_name: true,
      onboarded: true,
    });
  });

  it('does not fire matches_viewed for an empty list', () => {
    expect(matchesViewedProperties({ matchCount: 0, strongCount: 0, possibleCount: 0 })).toBeNull();
    expect(matchesViewedProperties({ matchCount: 2, strongCount: 1, possibleCount: 1 })).toEqual({
      match_count: 2,
      strong_count: 1,
      possible_count: 1,
    });
  });

  it('treats only saved reported_filed or submitted rows as confirmed filing', () => {
    expect(filingConfirmedProperties({ claimStatus: 'self_file', withConfirmationNumber: false })).toBeNull();
    expect(
      filingConfirmedProperties({ claimStatus: 'reported_filed', withConfirmationNumber: false }),
    ).toMatchObject({ evidence: 'user_reported_and_saved', is_filing: true });
    expect(
      filingConfirmedProperties({ claimStatus: 'submitted', withConfirmationNumber: true }),
    ).toMatchObject({ with_confirmation_number: true, claim_status: 'submitted' });
  });
});
