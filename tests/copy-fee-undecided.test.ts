import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BANNED = [
  /never\s+takes?\s+a\s+cut/i,
  /takes?\s+a\s+cut/i,
  /doesn['’]t\s+make\s+money/i,
  /pending\s+counsel/i,
  /draft\s+for\s+review/i,
  /fully\s+pre-?fills?/i,
  /pre-?fills?\s+(?:the|your)/i,
];

const TBD_PHRASES = [
  'ClaimMatch is free during beta',
  'We may introduce a fee later',
  'before it applies',
  'you’ll see the price before you use anything paid',
  'You always file on the official site',
  'ClaimMatch never files for you',
];

async function loadSurfaces(feeDisplay?: string) {
  vi.resetModules();
  if (feeDisplay === undefined) {
    delete process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY;
  } else {
    process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY = feeDisplay;
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
  delete process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY;
  vi.resetModules();
});

describe('fee copy when the amount is undecided', () => {
  it('FeeDisclosure uses the beta wording and never promises no cut', async () => {
    const { FeeDisclosure } = await loadSurfaces();
    const html = htmlOf(FeeDisclosure);
    expect(html).toContain('Cost');
    expect(html).not.toContain('Our fee');
    for (const phrase of TBD_PHRASES) expect(html).toContain(phrase);
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
    expectNoBanned(html);
  });
});

describe('fee copy when a price is set', () => {
  it('FeeDisclosure shows the price and a different, non-no-cut wording', async () => {
    const { FeeDisclosure } = await loadSurfaces('$4.99');
    const html = htmlOf(FeeDisclosure);
    expect(html).toContain('The price is $4.99');
    expect(html).toContain('You’ll see the price before you use anything paid');
    expect(html).toContain('You always file on the official site');
    expect(html).toContain('ClaimMatch never files for you');
    expect(html).not.toContain('free during beta');
    expect(html).not.toContain('We may introduce a fee later');
    expectNoBanned(html);
  });

  it('HowWeMakeMoney still has no draft or counsel markers', async () => {
    const { HowWeMakeMoney } = await loadSurfaces('$4.99');
    const html = htmlOf(HowWeMakeMoney);
    expect(html).toContain('The price is $4.99');
    expect(html).toContain('copy-ready details');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('counsel');
    expectNoBanned(html);
  });
});
