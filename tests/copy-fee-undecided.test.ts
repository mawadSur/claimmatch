import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAIMMATCH_TRIAL_DAYS, feeEveryClaimCopy, membershipPriceCopy } from '@/lib/copy';

const BANNED = [
  /never\s+takes?\s+a\s+cut/i,
  /takes?\s+a\s+cut/i,
  /doesn['’]t\s+make\s+money/i,
  /pending\s+counsel/i,
  /draft\s+for\s+review/i,
  /fully\s+pre-?fills?/i,
  /pre-?fills?\s+(?:the|your)/i,
  /be careful/i,
  /must pay to file/i,
];

const TBD_PHRASES = [
  'Lawsuit AI is free during beta',
  'We may introduce a fee later',
  'before it applies',
  'you’ll see the price before you use anything paid',
  'You always file on the official site',
  'Lawsuit AI never files for you',
];

async function loadSurfaces(disclose?: boolean) {
  vi.resetModules();
  if (disclose) {
    process.env.SUBSCRIPTION_BILLING_ENABLED = '1';
  } else {
    delete process.env.SUBSCRIPTION_BILLING_ENABLED;
  }
  const { FeeDisclosure } = await import('@/components/FeeDisclosure');
  const { HowWeMakeMoney } = await import('@/components/HowWeMakeMoney');
  return { FeeDisclosure, HowWeMakeMoney };
}

function htmlOf(type: Parameters<typeof createElement>[0], props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(type, props));
}

function expectNoBanned(html: string) {
  for (const pattern of BANNED) {
    expect(html, String(pattern)).not.toMatch(pattern);
  }
}

afterEach(() => {
  delete process.env.SUBSCRIPTION_BILLING_ENABLED;
  vi.resetModules();
});

describe('fee copy while disclosure is off (beta)', () => {
  it('FeeDisclosure uses the beta wording and never promises no cut', async () => {
    const { FeeDisclosure } = await loadSurfaces();
    const html = htmlOf(FeeDisclosure);
    expect(html).toContain('Cost');
    expect(html).not.toContain('Our fee');
    for (const phrase of TBD_PHRASES) expect(html).toContain(phrase);
    expect(html).not.toContain(feeEveryClaimCopy());
    expectNoBanned(html);
  });

  it('HowWeMakeMoney describes the model plainly', async () => {
    const { HowWeMakeMoney } = await loadSurfaces();
    const html = htmlOf(HowWeMakeMoney);
    expect(html).toContain('free during beta');
    expect(html).toContain('copy-ready details');
    expect(html).toContain('don’t run ads or sell paid plans today');
    expect(html).toContain('don’t sell your personal information');
    expect(html).toContain('don’t take money from settlement administrators or law firms');
    expect(html).toContain('We may introduce a fee later');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Pricing');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('counsel');
    expect(html).not.toContain(feeEveryClaimCopy());
    expectNoBanned(html);
  });
});

describe('fee copy when SUBSCRIPTION_BILLING_ENABLED=1', () => {
  it('FeeDisclosure says membership, no percentage of payouts', async () => {
    const { FeeDisclosure } = await loadSurfaces(true);
    const html = htmlOf(FeeDisclosure);
    expect(html).toContain(feeEveryClaimCopy());
    expect(html).toContain(`${CLAIMMATCH_TRIAL_DAYS}-day free trial`);
    expect(html).toContain(`${membershipPriceCopy()} a month`);
    expect(html).toContain('0 percent of your settlement payouts');
    expect(html).not.toContain('You always file on the official site');
    expect(html).not.toContain('Lawsuit AI never files for you');
    expect(html).not.toContain('free during beta');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toContain('15%');
    expect(html).not.toContain('15 percent');
    expectNoBanned(html);
  });

  it('Footer, Terms short summary and FAQ say membership with no leftover $0 cut promise', async () => {
    process.env.SUBSCRIPTION_BILLING_ENABLED = '1';
    vi.resetModules();
    const { Footer } = await import('@/components/Footer');
    const { default: TermsPage } = await import('@/app/terms/page');
    const { homeFaqItems } = await import('@/components/home/HomeFaq');
    const { membershipPriceCopy: price } = await import('@/lib/copy');
    const footer = htmlOf(Footer);
    expect(footer).toContain(`${CLAIMMATCH_TRIAL_DAYS}-day free trial`);
    expect(footer).toContain(`${price()} a month`);
    expect(footer).toContain('0 percent of settlement payouts');
    expect(footer).not.toContain('Free during beta');
    expect(footer).not.toContain('15%');
    const terms = htmlOf(TermsPage);
    expect(terms).toContain(`${CLAIMMATCH_TRIAL_DAYS}-day free trial`);
    expect(terms).toContain('0 percent of your settlement payouts');
    expect(terms).toContain('cancel anytime');
    expect(terms).not.toContain('Lawsuit AI submitted for you');
    expect(terms).not.toContain('never takes a share of it');
    expect(terms).not.toContain('We never take a share of any settlement payment.');
    const faq = homeFaqItems(true, true)
      .map((item) => item.a)
      .join('\n');
    expect(faq).toContain(feeEveryClaimCopy());
    expect(faq).not.toContain('Lawsuit AI never files for you');
    expect(faq).not.toContain('15%');
  });

  it('HowWeMakeMoney swaps the beta bullets for membership', async () => {
    const { HowWeMakeMoney } = await loadSurfaces(true);
    const html = htmlOf(HowWeMakeMoney);
    expect(html).toContain(feeEveryClaimCopy());
    expect(html).toContain('Copy-ready details');
    expect(html).toContain('Easy submit and new-claim alerts are included with membership');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('Lawsuit AI never files for you');
    expect(html).not.toContain('don’t run ads or sell paid plans today');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toContain('processes and submits it');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('counsel');
    expect(html).not.toContain('15%');
    expectNoBanned(html);
  });
});
