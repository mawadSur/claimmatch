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

const full: HeroPayout = {
  median: 99,
  max: 5000,
  maxTitle: 'Acme Data Breach Settlement',
  maxSlug: 'acme-data-breach',
  openCount: 98,
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
    expect(html).toContain('median listed payout $99');
    expect(html).toContain('98 open');
    expect(html).toContain('updated monthly');
    expect(html).toContain(heroClosingLine(6));
  });

  it('renders no payout line at all when the figures are null', () => {
    for (const payout of [null, undefined]) {
      const html = render(payout);
      expect(html).toContain(HOME_HERO_PRIMARY_CTA);
      expect(html).not.toMatch(/Open now: settlements listing/);
      expect(html).not.toMatch(/median listed payout/);
      expect(html).not.toMatch(/close in the next 30 days/);
      expect(html).not.toMatch(/\$[\d,]+ per person/);
    }
  });

  it('drops only the figures that are missing, never invents a stand-in', () => {
    const noMax = render({ ...full, max: null, maxTitle: null, maxSlug: null });
    expect(noMax).not.toMatch(/Open now: settlements listing/);
    // The max line carries the median, so without a max neither shows.
    expect(noMax).not.toMatch(/median listed payout/);

    const noMedian = render({ ...full, median: null });
    expect(noMedian).toContain('Open now: settlements listing up to $5,000 per person');
    expect(noMedian).not.toMatch(/median listed payout/);
    expect(noMedian).toContain('98 open');

    const noClosing = render({ ...full, closingCount: 0 });
    expect(noClosing).not.toMatch(/close in the next 30 days/);
    expect(noClosing).toContain('Open now: settlements listing up to $5,000 per person');
  });

  it('never renders a bare count as if it were money', () => {
    const html = render({ ...full, median: null, openCount: 0 });
    // No median and no count leaves the supporting line nothing true to say,
    // so it is dropped whole rather than printed as a bare "updated monthly".
    expect(html).not.toMatch(/\b0 open\b/);
    expect(html).not.toMatch(/updated monthly/);
    expect(html).not.toMatch(/median listed payout/);
    // The figure the caller does have still shows.
    expect(html).toContain('Open now: settlements listing up to $5,000 per person');
  });

  it('keeps the hero headline in copy.ts, in one piece', () => {
    expect(HOME_HERO_HEADLINE).toBe('Find the settlements that are actually yours.');
    const html = render(full);
    expect(html).toContain('Find the settlements');
    expect(html).toContain('that are actually yours.');
  });
});

describe('hero payout copy', () => {
  it('builds the supporting line only from the parts it was given', () => {
    expect(heroPayoutSupport({ medianLabel: '$99', openLabel: '98' })).toBe(
      'median listed payout $99 · 98 open · updated monthly',
    );
    expect(heroPayoutSupport({ medianLabel: '$99' })).toBe('median listed payout $99 · updated monthly');
    expect(heroPayoutSupport({ openLabel: '98' })).toBe('98 open · updated monthly');
    expect(heroPayoutSupport({})).toBeNull();
    expect(heroPayoutSupport({ medianLabel: null, openLabel: null })).toBeNull();
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
  const source = () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { fileURLToPath } = require('node:url') as typeof import('node:url');
    return readFileSync(
      fileURLToPath(new URL('../src/components/home/HeroMotion.tsx', import.meta.url)),
      'utf8',
    );
  };

  it('checks prefers-reduced-motion before it animates anything', () => {
    const src = source();
    const guard = src.indexOf('prefers-reduced-motion: reduce');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf('animate('));
  });

  it('animates transform and opacity only, so nothing reflows', () => {
    const src = source();
    expect(src).toMatch(/opacity:\s*\[0, 1\]/);
    expect(src).toMatch(/y:\s*\[14, 0\]/);
    expect(src).not.toMatch(/\b(width|height|top|left|margin|padding):/);
  });

  it('leaves the server HTML in its finished state', () => {
    // Motion runs in an effect against markup the server already painted, so
    // the hero never ships with an opacity-0 or transformed inline style.
    const html = render(full);
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/translateY/);
  });
});
