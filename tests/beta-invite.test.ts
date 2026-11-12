import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BETA_INVITE_UTM_CAMPAIGN,
  BETA_INVITE_UTM_MEDIUM,
  BETA_INVITE_UTM_SOURCE,
  betaInviteDestination,
  betaInviteUrl,
  isBetaInviteLink,
  sanitizeBetaInviteLabel,
  tallyBetaInvite,
} from '@/lib/beta-invite';
import { betaCodeVisitProperties } from '@/lib/analytics/events';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('beta invite helpers', () => {
  it('identifies beta share links by the UTM pair, not the campaign string alone', () => {
    expect(
      isBetaInviteLink({ utm_source: BETA_INVITE_UTM_SOURCE, utm_medium: BETA_INVITE_UTM_MEDIUM }),
    ).toBe(true);
    expect(isBetaInviteLink({ utm_source: 'twitter', utm_medium: 'invite' })).toBe(false);
    expect(isBetaInviteLink({ utm_source: 'beta', utm_medium: 'email' })).toBe(false);
    expect(BETA_INVITE_UTM_CAMPAIGN).toBe('soft-beta');
  });

  it('builds /invite?code= URLs and destinations from the landing flag', () => {
    expect(betaInviteUrl('https://lawsuitai.org', 'Ada-1')).toBe(
      'https://lawsuitai.org/invite?code=Ada-1',
    );
    expect(betaInviteDestination()).toBe('/signup');
    vi.stubEnv('SOFT_INVITE_LANDING_ENABLED', '1');
    expect(betaInviteDestination()).toBe('/invite');
  });

  it('clips labels and tallies funnel counts without inventing rows', () => {
    expect(sanitizeBetaInviteLabel('  Tester Ada  ')).toBe('Tester Ada');
    expect(sanitizeBetaInviteLabel('')).toBeNull();
    expect(sanitizeBetaInviteLabel('x'.repeat(90))?.length).toBe(80);
    const tallied = tallyBetaInvite([
      { code: 'ada', visits: 2, signups: 1, onboarded: 1, matchViews: 1, formOpens: 3, filings: 1 },
    ]);
    expect(tallied.get('ada')).toEqual({
      visits: 2,
      signups: 1,
      profilesCompleted: 1,
      matchesViewed: 1,
      officialFormsOpened: 3,
      filingsReported: 1,
    });
  });

  it('sends only a boolean for beta_code_visit', () => {
    expect(betaCodeVisitProperties({ hasCode: true })).toEqual({ has_code: true });
    const json = JSON.stringify(betaCodeVisitProperties({ hasCode: false }));
    expect(json).toBe('{"has_code":false}');
    expect(json).not.toMatch(/email|phone|@/i);
  });
});
