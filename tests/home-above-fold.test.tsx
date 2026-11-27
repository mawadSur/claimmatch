import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeHero, type HeroPayout } from '@/components/home/HomeHero';
import type { Screen } from '@/components/home/DeviceFrame';
import {
  CLAIMMATCH_TRIAL_DAYS,
  HOME_HERO_HEADLINE,
  HOME_HERO_PAYMENT_CLARITY,
  HOME_HERO_PRIMARY_CTA,
  heroClosingLine,
  heroPayoutSupport,
  homeHeroPriceLine,
  membershipPriceCopy,
  statedAmountLabel,
} from '@/lib/copy';

/**
 * The above-the-fold contract: one primary action, the price where a visitor
 * can see it before clicking anything, who actually pays them, and — the rule
 * that matters most — not one payout figure the caller did not supply.
 */

const screen = (src: string): Screen => ({ src, alt: `alt for ${src}`, width: 780, height: 1688 });

const base = {
  primary: { href: '/preview', label: HOME_HERO_PRIMARY_CTA },
  browse: { href: '/lawsuits', label: 'See open settlements' },
  freeLabel: 'Official filing stays free',
  stats: null,
  desktop: { src: '/screens/catalog-desktop.webp', alt: 'desktop', width: 1600, height: 1000 },
  phone: screen('/screens/dashboard-mobile.webp'),
  mobile: screen('/screens/catalog-mobile.webp'),
  priceLine: homeHeroPriceLine(true),
};

const render = (payout?: HeroPayout | null) =>
  renderToStaticMarkup(createElement(HomeHero, { ...base, payout }));

/** Shaped like the live catalog on 2026-11-27: 22 of 98 state an amount. */
const full: HeroPayout = {
  median: 250,
  max: 5000,
  maxTitle: 'Acme Data Breach Settlement',
  maxSlug: 'acme-data-breach',
  openCount: 98,
  statedCount: 22,
  closingCount: 6,
};

describe('home hero, above the fold', () => {
  it('has exactly one primary button, and demotes browsing to a text link', () => {
    const html = render(full);
    expect(html.match(/btn-primary/g) ?? []).toHaveLength(1);
    expect(html).toContain(HOME_HERO_PRIMARY_CTA);
    expect(html).toContain('href="/preview"');
    // Browse and how-it-works are still reachable, as plain links.
    expect(html).toContain('See open settlements');
    expect(html).toContain('href="#how-it-works"');
    expect(html).toMatch(/class="text-link[^"]*"[^>]*>\s*See open settlements/);
  });

  it('states the membership price and the cardless trial in the hero itself', () => {
    const html = render(full);
    expect(html).toContain(membershipPriceCopy());
    expect(html).toContain(`${CLAIMMATCH_TRIAL_DAYS}-day free trial`);
    expect(html).toContain('no card to start');
    expect(html).toContain('Free to search and track.');
    // The price sits above the one call to action's own section, not 63% down a page.
    expect(html.indexOf(homeHeroPriceLine(true))).toBeGreaterThan(-1);
  });

  it('says who pays, by method name, with no payment brand marks', () => {
    const html = render(full);
    expect(html).toContain(HOME_HERO_PAYMENT_CLARITY);
    expect(html).toMatch(/administrator pays you directly/);
    for (const brand of ['zelle', 'paypal', 'venmo']) {
      // The names appear as text; no logo file, icon component or brand image.
      expect(html.toLowerCase()).toContain(brand);
      expect(html.toLowerCase()).not.toMatch(new RegExp(`(src|href)="[^"]*${brand}`));
    }
  });

  it('shows each payout figure the caller supplied, attributed to its listing', () => {
    const html = render(full);
    expect(html).toContain('Open now: settlements listing up to $5,000 per person');
    expect(html).toContain('the highest is Acme Data Breach Settlement');
    expect(html).toContain('href="/lawsuits/acme-data-breach"');
    expect(html).toContain('median $250 of the 22 settlements that list an amount');
    expect(html).toContain('98 open now');
    expect(html).toContain(heroClosingLine(6));
    // No hardcoded cadence claim: the ingest cron runs daily, and the badge
    // above already prints the real refresh timestamp.
    expect(html).not.toMatch(/updated monthly/);
  });

  it('renders no payout line at all when the figures are null', () => {
    for (const payout of [null, undefined]) {
      const html = render(payout);
      expect(html).toContain(HOME_HERO_PRIMARY_CTA);
      expect(html).not.toMatch(/Open now: settlements listing/);
      expect(html).not.toMatch(/median \$/);
      expect(html).not.toMatch(/close in the next 30 days/);
      expect(html).not.toMatch(/\$[\d,]+ per person/);
    }
  });

  it('drops only the figures that are missing, never invents a stand-in', () => {
    const noMax = render({ ...full, max: null, maxTitle: null, maxSlug: null });
    expect(noMax).not.toMatch(/Open now: settlements listing/);
    // The max line carries the median, so without a max neither shows.
    expect(noMax).not.toMatch(/median \$/);

    const noMedian = render({ ...full, median: null });
    expect(noMedian).toContain('Open now: settlements listing up to $5,000 per person');
    expect(noMedian).not.toMatch(/median \$/);
    expect(noMedian).toContain('98 open now');

    const noClosing = render({ ...full, closingCount: 0 });
    expect(noClosing).not.toMatch(/close in the next 30 days/);
    expect(noClosing).toContain('Open now: settlements listing up to $5,000 per person');
  });

  it('never renders a bare count as if it were money', () => {
    const html = render({ ...full, median: null, openCount: 0, statedCount: 0 });
    expect(html).not.toMatch(/\b0 open\b/);
    expect(html).not.toMatch(/median \$/);
    // The figure the caller does have still shows.
    expect(html).toContain('Open now: settlements listing up to $5,000 per person');
  });

  it('never prints the median beside the open count alone', () => {
    // The whole point: 76 of 98 open listings state no amount, so a median
    // juxtaposed with "98 open" would claim the typical settlement pays $250.
    const html = render(full);
    expect(html).not.toMatch(/median \$250 · 98 open/);
    expect(html).toContain('median $250 of the 22 settlements that list an amount');
    // With no denominator the median is withheld, not printed bare.
    const noDenominator = render({ ...full, statedCount: 0 });
    expect(noDenominator).not.toMatch(/median \$/);
    expect(noDenominator).toContain('98 open now');
  });

  it('does not round a stated amount into one no listing states', () => {
    // formatOwedUsd rounds to whole dollars: $12.50 -> "$13", $0.50 -> "$1".
    // Live data contains both, directly under "Amounts are what each listing
    // states", so the hero formats cents when the amount has them.
    const cents = render({ ...full, max: 12.5, median: 0.5, statedCount: 3 });
    expect(cents).toContain('up to $12.50 per person');
    expect(cents).not.toMatch(/up to \$13 per person/);
    expect(cents).toContain('median $0.50 of the 3 settlements');
  });

  it('withholds a figure that would render as $0 rather than printing it', () => {
    const zero = render({ ...full, max: 0.001, maxTitle: null, maxSlug: null, median: 0.001 });
    expect(zero).not.toMatch(/\$0\b/);
    expect(zero).not.toMatch(/Open now: settlements listing/);
  });

  it('keeps the hero headline hedged, and in copy.ts in one piece', () => {
    // The product cannot determine entitlement. /preview says so outright
    // ("This is not a decision that you qualify"), and the hero's own note
    // says the administrator decides. "actually yours" asserted ownership in
    // the largest type on the page; a disclaimer below cannot unsay an H1.
    expect(HOME_HERO_HEADLINE).toBe('Find the settlements that may be yours.');
    expect(HOME_HERO_HEADLINE).not.toMatch(/actually yours/);
    const html = render(full);
    expect(html).toContain('Find the settlements');
    expect(html).toContain('that may be yours.');
  });
});

describe('hero payout copy', () => {
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
    // Nothing that would print as "$0", and nothing from a non-figure.
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
    // The hero renders whichever line the page hands it, and nothing else.
    const html = renderToStaticMarkup(
      createElement(HomeHero, { ...base, priceLine: homeHeroPriceLine(false), payout: full }),
    );
    expect(html).not.toMatch(/Easy submit/i);
    expect(html).toContain('no card to start');
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
    // The entrance used to run here, fading in content the browser had
    // already painted — roughly 440ms of blanked headline, payout card and
    // CTA after hydration, worst in the common case. Entrances belong in CSS
    // (.stagger + --i in globals.css), which runs at first paint; this file
    // is for interaction feedback only.
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/opacity/);
    expect(code).not.toMatch(/stagger\(/);
    expect(code).not.toMatch(/performance\.now/);
  });

  it('drives the entrance from CSS, which cannot blank painted content', () => {
    const html = render(full);
    // Server HTML ships visible: no inline opacity or transform anywhere.
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/translateY/);
    // The parent opts into the CSS page-load stagger and children index it.
    expect(html).toMatch(/class="stagger /);
    expect(html).toMatch(/--i:\s*0/);
    // globals.css collapses every animation under prefers-reduced-motion.
    const css = readFileSync(
      fileURLToPath(new URL('../src/app/globals.css', import.meta.url)),
      'utf8',
    );
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.stagger > \*/);
  });
});
