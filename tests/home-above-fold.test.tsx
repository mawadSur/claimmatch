import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeHero } from '@/components/home/HomeHero';
import type { Screen } from '@/components/home/DeviceFrame';
import {
  HOME_HERO_HEADLINE,
  HOME_HERO_PRIMARY_CTA,
  HOME_HERO_SUBLINE,
  OPERATOR_LEGAL_NAME,
  heroClosingLine,
  heroPayoutSupport,
  homeHeroPriceLine,
  membershipPriceCopy,
  statedAmountLabel,
} from '@/lib/copy';

/**
 * Simplified above-the-fold contract: one headline, one short subline, one
 * primary CTA, one secondary link, and at most three trust chips.
 */

const screen = (src: string): Screen => ({ src, alt: `alt for ${src}`, width: 780, height: 1688 });

const base = {
  primary: { href: '/preview', label: HOME_HERO_PRIMARY_CTA },
  browse: { href: '/lawsuits', label: 'See open settlements' },
  stats: null,
  desktop: { src: '/screens/catalog-desktop.webp', alt: 'desktop', width: 1600, height: 1000 },
  mobile: screen('/screens/catalog-mobile.webp'),
};

const render = () => renderToStaticMarkup(createElement(HomeHero, base));

describe('home hero, above the fold', () => {
  it('has exactly one primary button and one secondary text link', () => {
    const html = render();
    expect(html.match(/btn-primary/g) ?? []).toHaveLength(1);
    expect(html).toContain(HOME_HERO_PRIMARY_CTA);
    expect(html).toContain('href="/preview"');
    expect(html).toContain('See open settlements');
    expect(html).toMatch(/class="text-link[^"]*"[^>]*>\s*See open settlements/);
    expect(html).not.toContain('href="#how-it-works"');
  });

  it('keeps the subline short and free/no-card honest', () => {
    const words = HOME_HERO_SUBLINE.trim().split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(15);
    const html = render();
    expect(html).toContain(HOME_HERO_SUBLINE);
    expect(html).toMatch(/free/i);
    expect(html).toMatch(/no card/i);
  });

  it('shows at most three trust chips, including LLC and payout clarity', () => {
    const html = render();
    expect(html).toContain(OPERATOR_LEGAL_NAME);
    expect(html).toMatch(/not a law firm/i);
    expect(html).toContain('Free to match · no card');
    expect(html).toContain('We never touch your payout');
    // No multi-paragraph fee / payment blocks in the hero.
    expect(html).not.toContain(homeHeroPriceLine(true));
    expect(html).not.toMatch(/administrator pays you directly/);
  });

  it('keeps the hero headline hedged, and in copy.ts in one piece', () => {
    expect(HOME_HERO_HEADLINE).toBe('Find the settlements that may be yours.');
    expect(HOME_HERO_HEADLINE).not.toMatch(/actually yours/);
    const html = render();
    expect(html).toContain('Find the settlements');
    expect(html).toContain('that may be yours.');
  });
});

describe('hero payout copy helpers', () => {
  it('builds the supporting line only from the parts it was given', () => {
    expect(heroPayoutSupport({ medianLabel: '$250', statedCount: 22, openLabel: '98' })).toBe(
      'median $250 of the 22 settlements that list an amount · 98 open now',
    );
    expect(heroPayoutSupport({ medianLabel: '$250', statedCount: 22 })).toBe(
      'median $250 of the 22 settlements that list an amount',
    );
    expect(heroPayoutSupport({ openLabel: '98' })).toBe('98 open now');
    expect(heroPayoutSupport({})).toBeNull();
    expect(heroPayoutSupport({ medianLabel: null, openLabel: null })).toBeNull();
  });

  it('drops the median when it has no denominator to scope it', () => {
    expect(heroPayoutSupport({ medianLabel: '$250', statedCount: 0, openLabel: '98' })).toBe(
      '98 open now',
    );
    expect(heroPayoutSupport({ medianLabel: '$250', statedCount: null })).toBeNull();
  });

  it('says "the one settlement" rather than a median of one', () => {
    expect(heroPayoutSupport({ medianLabel: '$99', statedCount: 1 })).toBe(
      'the one settlement that lists an amount lists $99',
    );
  });

  it('formats a stated amount without rounding away its cents', () => {
    expect(statedAmountLabel(5000)).toBe('$5,000');
    expect(statedAmountLabel(12.5)).toBe('$12.50');
    expect(statedAmountLabel(0.5)).toBe('$0.50');
    expect(statedAmountLabel(964.48)).toBe('$964.48');
    expect(statedAmountLabel(250)).toBe('$250');
    expect(statedAmountLabel(0.001)).toBeNull();
    expect(statedAmountLabel(0)).toBeNull();
    expect(statedAmountLabel(null)).toBeNull();
    expect(statedAmountLabel(undefined)).toBeNull();
    expect(statedAmountLabel(Number.NaN)).toBeNull();
  });

  it('counts settlements closing in the window the caller measures', () => {
    expect(heroClosingLine(1)).toBe('1 settlement closes in the next 30 days');
    expect(heroClosingLine(6)).toBe('6 settlements close in the next 30 days');
  });

  it('prices Easy submit from the membership constants, not a literal', () => {
    expect(homeHeroPriceLine(true)).toContain(membershipPriceCopy());
    expect(homeHeroPriceLine(true, 14, '$1.00')).toBe(
      'Easy submit — we prepare and file it for you — is $1.00/mo after a 14-day free trial, no card to start.',
    );
  });

  it('does not advertise Easy submit while lawsuitAiMayFile() is shut', () => {
    const shut = homeHeroPriceLine(false, 14, '$1.00');
    expect(shut).not.toMatch(/Easy submit/i);
    expect(shut).not.toMatch(/\bwe\s+(?:prepare and )?file/i);
    expect(shut).toBe(
      'Membership — new-claim alerts and every deadline tracked — is $1.00/mo after a 14-day free trial, no card to start.',
    );
  });
});

describe('hero motion', () => {
  const source = () =>
    readFileSync(
      fileURLToPath(new URL('../src/components/home/HeroMotion.tsx', import.meta.url)),
      'utf8',
    );

  it('checks prefers-reduced-motion before it animates anything', () => {
    const src = source();
    const guard = src.indexOf('prefers-reduced-motion: reduce');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf('animate('));
  });

  it('animates transform only, so nothing can reflow', () => {
    const src = source();
    expect(src).toMatch(/\{ scale \}/);
    expect(src).not.toMatch(/\b(width|height|top|left|margin|padding):/);
  });

  it('never animates opacity from an effect', () => {
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/opacity/);
    expect(code).not.toMatch(/stagger\(/);
    expect(code).not.toMatch(/performance\.now/);
  });

  it('drives the entrance from CSS, which cannot blank painted content', () => {
    const html = render();
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/translateY/);
    expect(html).toMatch(/class="stagger /);
    expect(html).toMatch(/--i:\s*0/);
    const css = readFileSync(
      fileURLToPath(new URL('../src/app/globals.css', import.meta.url)),
      'utf8',
    );
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.stagger > \*/);
  });
});
