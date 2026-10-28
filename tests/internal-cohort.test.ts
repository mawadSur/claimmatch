import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SoftLaunchCard } from '@/components/admin/SoftLaunchCard';
import { isInternalEmail, parseEmailList } from '@/lib/internal-users';
import {
  EMPTY_SOFT_LAUNCH_COUNTS,
  cohortFromCampaign,
  isSoftLaunchCohort,
  tallySoftLaunch,
} from '@/lib/soft-launch';

describe('internal email matcher', () => {
  it('parses INTERNAL_EMAILS and matches case-insensitively', () => {
    const list = parseEmailList('Ops@Example.com, not-an-email, jane@claimmatch.app');
    expect(list).toEqual(['ops@example.com', 'jane@claimmatch.app']);
    expect(isInternalEmail('OPS@example.com', list)).toBe(true);
    expect(isInternalEmail('user@example.com', list)).toBe(false);
    expect(isInternalEmail(null, list)).toBe(false);
    expect(parseEmailList('')).toEqual([]);
  });
});

describe('soft-launch cohort parser', () => {
  it('accepts campaigns that start with soft-', () => {
    expect(cohortFromCampaign('soft-1')).toBe('soft-1');
    expect(cohortFromCampaign('SOFT-2')).toBe('soft-2');
    expect(cohortFromCampaign('personal')).toBeNull();
    expect(cohortFromCampaign('soft-')).toBeNull();
    expect(isSoftLaunchCohort('soft-1')).toBe(true);
    expect(isSoftLaunchCohort('beta')).toBe(false);
  });

  it('tallies invitees and excludes internal testers', () => {
    expect(
      tallySoftLaunch([
        { cohort: 'soft-1', onboarded: true, is_internal: false, official_form_clicks: 2, filings_reported: 1 },
        { cohort: 'soft-1', onboarded: false, is_internal: true, official_form_clicks: 9, filings_reported: 9 },
        { cohort: 'personal', onboarded: true, is_internal: false, official_form_clicks: 1, filings_reported: 1 },
      ]),
    ).toEqual({
      signups: 1,
      onboarded: 1,
      officialFormClicks: 2,
      filingsReported: 1,
    });
    expect(EMPTY_SOFT_LAUNCH_COUNTS).toEqual({
      signups: 0,
      onboarded: 0,
      officialFormClicks: 0,
      filingsReported: 0,
    });
  });

  it('renders the admin card with zero rows', () => {
    const html = renderToStaticMarkup(createElement(SoftLaunchCard, { counts: EMPTY_SOFT_LAUNCH_COUNTS }));
    expect(html).toContain('Soft launch');
    expect(html).toContain('Signups');
    expect(html).toMatch(/>0</);
  });
});
