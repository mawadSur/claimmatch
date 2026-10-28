import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BETA_FEE_COPY,
  CLAIMMATCH_FEE_RATE,
  FILING_FREE_WARNING,
  OFFICIAL_FILING_IS_FREE,
  feeEveryClaimCopy,
  publicCostNote,
} from '@/lib/copy';
import PricingPage from '@/app/pricing/page';

const BANNED_WARNING = /be careful|must pay to file|never have to pay/i;

afterEach(() => {
  delete process.env.FEE_DISCLOSURE_ENABLED;
  vi.resetModules();
});

describe('C1 official-filing and fee copy', () => {
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

  it('keeps the recovery-share wording interpolated so copy-guard stays clean', () => {
    expect(feeEveryClaimCopy()).toContain(`${CLAIMMATCH_FEE_RATE} percent`);
    expect(feeEveryClaimCopy()).toContain('every claim you make through ClaimMatch');
    expect(feeEveryClaimCopy()).toContain('not only assisted filings');
    expect(feeEveryClaimCopy()).not.toContain('15%');
  });

  it('renders beta copy on /pricing by default', () => {
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain(OFFICIAL_FILING_IS_FREE);
    expect(html).toContain('Free during beta');
    expect(html).toContain('We may introduce a fee later');
    expect(html).not.toMatch(BANNED_WARNING);
    expect(html).not.toContain(feeEveryClaimCopy());
  });

  it('renders the every-claim fee on /pricing when FEE_DISCLOSURE_ENABLED=1', async () => {
    process.env.FEE_DISCLOSURE_ENABLED = '1';
    vi.resetModules();
    const { default: FlaggedPricing } = await import('@/app/pricing/page');
    const html = renderToStaticMarkup(createElement(FlaggedPricing));
    expect(html).toContain(feeEveryClaimCopy());
    expect(html).toContain(OFFICIAL_FILING_IS_FREE);
    expect(html).not.toContain('Free during beta');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toMatch(BANNED_WARNING);
  });
});
