import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAIMMATCH_FEE_RATE, feeEveryClaimCopy } from '@/lib/copy';

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
  'ClaimMatch is free during beta',
  'We may introduce a fee later',
  'before it applies',
  'you’ll see the price before you use anything paid',
  'You always file on the official site',
  'ClaimMatch never files for you',
];

async function loadSurfaces(disclose?: boolean) {
  vi.resetModules();
  if (disclose) {
    process.env.FEE_DISCLOSURE_ENABLED = '1';
  } else {
    delete process.env.FEE_DISCLOSURE_ENABLED;
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
  delete process.env.FEE_DISCLOSURE_ENABLED;
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

describe('fee copy when FEE_DISCLOSURE_ENABLED=1', () => {
  it('FeeDisclosure states the recovery share on every claim', async () => {
    const { FeeDisclosure } = await loadSurfaces(true);
    const html = htmlOf(FeeDisclosure);
    expect(html).toContain(feeEveryClaimCopy());
    expect(html).toContain(`${CLAIMMATCH_FEE_RATE} percent`);
    expect(html).toContain('every claim you make through ClaimMatch');
    expect(html).toContain('not only assisted filings');
    expect(html).toContain('You always file on the official site');
    expect(html).toContain('ClaimMatch never files for you');
    expect(html).not.toContain('free during beta');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toContain('15%');
    expectNoBanned(html);
  });

  it('HowWeMakeMoney swaps the beta bullets for the every-claim fee', async () => {
    const { HowWeMakeMoney } = await loadSurfaces(true);
    const html = htmlOf(HowWeMakeMoney);
    expect(html).toContain(feeEveryClaimCopy());
    expect(html).toContain('copy-ready details');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('don’t run ads or sell paid plans today');
    expect(html).not.toContain('We may introduce a fee later');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('counsel');
    expect(html).not.toContain('15%');
    expectNoBanned(html);
  });
});
