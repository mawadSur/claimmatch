import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BETA_FEE_COPY,
  CLAIMMATCH_TRIAL_DAYS,
  FILING_FREE_WARNING,
  OFFICIAL_FILING_IS_FREE,
  feeEveryClaimCopy,
  membershipCopy,
  membershipPriceCopy,
  publicCostNote,
} from '@/lib/copy';
import PricingPage from '@/app/pricing/page';

const BANNED_WARNING = /be careful|must pay to file|never have to pay/i;

afterEach(() => {
  delete process.env.SUBSCRIPTION_BILLING_ENABLED;
  vi.resetModules();
});

describe('C1 official-filing and membership copy', () => {
  it('drops the contradicting “be careful if someone asks for a fee” line', () => {
    expect(OFFICIAL_FILING_IS_FREE).toBe('Filing on the official site is always free.');
    expect(FILING_FREE_WARNING).toBe(OFFICIAL_FILING_IS_FREE);
    expect(OFFICIAL_FILING_IS_FREE).not.toMatch(BANNED_WARNING);
    expect(BETA_FEE_COPY).toContain('free during beta');
    expect(BETA_FEE_COPY).not.toMatch(BANNED_WARNING);
    expect(feeEveryClaimCopy()).not.toMatch(BANNED_WARNING);
    expect(publicCostNote(false)).toBe(`${OFFICIAL_FILING_IS_FREE} ${BETA_FEE_COPY}`);
    expect(publicCostNote(true)).toBe(feeEveryClaimCopy());
  });

  it('keeps membership wording interpolated so copy-guard stays clean', () => {
    expect(membershipCopy()).toContain(`${CLAIMMATCH_TRIAL_DAYS}-day free trial`);
    expect(membershipCopy()).toContain(`${membershipPriceCopy()} a month`);
    expect(membershipCopy()).toContain('0 percent of your settlement payouts');
    expect(membershipCopy()).toContain('cancel anytime');
    expect(membershipCopy()).not.toContain('15%');
    expect(membershipCopy()).not.toContain('15 percent');
  });

  it('renders beta copy on /pricing by default', () => {
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain(OFFICIAL_FILING_IS_FREE);
    expect(html).toContain('Free during beta');
    expect(html).toContain('We may introduce a fee later');
    expect(html).not.toMatch(BANNED_WARNING);
    expect(html).not.toContain(feeEveryClaimCopy());
  });

  it('renders membership pricing when SUBSCRIPTION_BILLING_ENABLED=1', async () => {
    process.env.SUBSCRIPTION_BILLING_ENABLED = '1';
    vi.resetModules();
    const { default: FlaggedPricing } = await import('@/app/pricing/page');
    const { membershipCopy: copy, membershipPriceCopy: price } = await import('@/lib/copy');
    const html = renderToStaticMarkup(createElement(FlaggedPricing));
    expect(html).toContain(copy());
    expect(html).toContain(OFFICIAL_FILING_IS_FREE);
    expect(html).toContain(`${price()}/month`);
    expect(html).toContain('Pro');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toContain('A share of what you receive');
    expect(html).not.toMatch(BANNED_WARNING);
  });
});
