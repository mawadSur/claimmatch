import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { TrustBadges } from '@/components/TrustBadges';
import { pickTopPayouts, statedDollarPayout } from '@/lib/top-payouts';
import { homeFeatures } from '@/components/home/HomeFeatures';
import { faqGroups, allFaqItems } from '@/lib/faq';
import { homeFaqItems } from '@/components/home/HomeFaq';
import { filingFact, lawsuitAiMayFile, whoFilesAnswer } from '@/lib/copy';
import { SAMPLE_TESTIMONIALS, showSampleTestimonials } from '@/lib/sample-testimonials';
import { Testimonials } from '@/components/home/Testimonials';
import { MIN_TESTIMONIALS, type Testimonial } from '@/lib/testimonials';

type Row = {
  id: string;
  title: string;
  deadline: string | null;
  payout_min?: number | null;
  payout_max?: number | null;
  typical_payout?: string | null;
};

const row = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  title: `Settlement ${id}`,
  deadline: '2027-01-01',
  payout_min: null,
  payout_max: null,
  typical_payout: null,
  ...extra,
});

describe('statedDollarPayout', () => {
  it('counts only $ amounts, never years, months or fund totals', () => {
    expect(statedDollarPayout('$25 per vehicle for model years 2018-2021')).toBe(25);
    expect(statedDollarPayout('$10 per 12 months')).toBe(10);
    expect(statedDollarPayout('12 months of credit monitoring')).toBeNull();
    expect(statedDollarPayout('Up to $500 from a $5 million fund')).toBe(500);
    expect(statedDollarPayout('$2.3B settlement')).toBeNull();
    expect(statedDollarPayout('Up to $1,200 per person')).toBe(1200);
    expect(statedDollarPayout(null)).toBeNull();
  });
});

describe('pickTopPayouts', () => {
  it('ranks by the $ amount in the displayed payout text and drops rows without one', () => {
    const rows = [
      row('a', { typical_payout: '$50' }),
      row('b', { typical_payout: 'Up to $1,200 per person' }),
      row('c', { typical_payout: 'Varies' }),
      // payout_max alone is not shown on the card, so it never ranks a row.
      row('d', { payout_max: 9000, typical_payout: null }),
      row('e', { typical_payout: '$25 for purchases 2016 to 2023' }),
    ];
    expect(pickTopPayouts(rows).map((r) => r.id)).toEqual(['b', 'a', 'e']);
  });

  it('breaks ties by sooner deadline, then title, and respects the limit', () => {
    const rows = [
      row('late', { typical_payout: '$100', deadline: '2027-06-01' }),
      row('none', { typical_payout: '$100', deadline: null }),
      row('soon', { typical_payout: '$100', deadline: '2027-02-01' }),
      row('big', { typical_payout: 'Up to $900' }),
    ];
    expect(pickTopPayouts(rows).map((r) => r.id)).toEqual(['big', 'soon', 'late', 'none']);
    expect(pickTopPayouts(rows, 2).map((r) => r.id)).toEqual(['big', 'soon']);
    expect(pickTopPayouts(rows, 0)).toEqual([]);
  });
});

describe('homeFeatures', () => {
  const off = () => false;
  const on = () => true;

  it('lists only always-on features when flags are off', () => {
    const titles = homeFeatures({ deadlineReminders: off, matchAlertEmails: off, noticeLookup: off }).map((f) => f.title);
    expect(titles).toHaveLength(4);
    expect(titles).not.toContain('Deadline reminders');
    expect(titles).not.toContain('New match alerts');
    expect(titles).not.toContain('Check a notice you got');
  });

  it('adds flagged features only when their flag is on', () => {
    const titles = homeFeatures({ deadlineReminders: on, matchAlertEmails: on, noticeLookup: on }).map((f) => f.title);
    expect(titles).toEqual(expect.arrayContaining(['Deadline reminders', 'New match alerts', 'Check a notice you got']));
  });
});

describe('FAQ', () => {
  it('starts with the home page answers so the two never drift', () => {
    expect(faqGroups(false)[0].items).toEqual(homeFaqItems(false));
    expect(faqGroups(true)[0].items).toEqual(homeFaqItems(true));
  });

  it('never says both "Lawsuit AI files" and "never files" in one FAQ', () => {
    for (const [disclose, mayFile] of [[false, false], [false, true], [true, true]] as const) {
      const text = homeFaqItems(disclose, mayFile).map((i) => i.a).join(' ');
      const saysFiles = /Lawsuit AI files (?:the|this) claim for you/.test(text);
      const saysNever = /never files/.test(text);
      expect(saysFiles && saysNever, `disclose=${disclose} mayFile=${mayFile}`).toBe(false);
      expect(saysFiles).toBe(mayFile);
    }
  });

  it('who-files copy follows the fee and one-click flags', () => {
    expect(lawsuitAiMayFile({ feeDisclosure: () => false, oneClickFiling: () => false })).toBe(false);
    expect(lawsuitAiMayFile({ feeDisclosure: () => true, oneClickFiling: () => false })).toBe(true);
    expect(lawsuitAiMayFile({ feeDisclosure: () => false, oneClickFiling: () => true })).toBe(true);
    expect(filingFact(false).body).toContain('never files for you');
    expect(filingFact(true).body).not.toContain('never files');
    expect(whoFilesAnswer(true)).toContain('official site yourself');
  });

  it('money and badge surfaces drop "never files" when one-click filing is on', () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    vi.stubEnv('FEE_DISCLOSURE_ENABLED', '');
    try {
      for (const el of [createElement(HowWeMakeMoney), createElement(FeeDisclosure), createElement(TrustBadges)]) {
        const html = renderToStaticMarkup(el);
        expect(html).not.toMatch(/never files|You always file|You file on the official site/);
      }
      expect(renderToStaticMarkup(createElement(HowWeMakeMoney))).toContain('Lawsuit AI files this claim for you');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('has unique questions with non-empty answers', () => {
    const items = allFaqItems(false);
    expect(new Set(items.map((i) => i.q)).size).toBe(items.length);
    for (const i of items) expect(i.a.trim()).not.toBe('');
  });
});

describe('sample reviews', () => {
  it('never show in production, only in development and Vercel previews', () => {
    expect(showSampleTestimonials({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(showSampleTestimonials({ NODE_ENV: 'production', VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(showSampleTestimonials({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(showSampleTestimonials({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(showSampleTestimonials({ NODE_ENV: 'production', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('render with a Sample label and disclaimer when allowed', () => {
    const html = renderToStaticMarkup(createElement(Testimonials, { items: [], showSamples: true }));
    expect(html).toContain('Sample reviews, not from real users');
    expect(html).toContain(SAMPLE_TESTIMONIALS[0].name);
    expect(html).not.toContain('Shared with permission');
  });

  it('are replaced by real reviews once there are enough', () => {
    const real: Testimonial[] = Array.from({ length: MIN_TESTIMONIALS }, (_, i) => ({
      quote: `Real ${i}`,
      name: `Real ${i}.`,
      receivedOn: '2026-11-01',
      source: 'email',
      consentToPublish: true,
    }));
    const html = renderToStaticMarkup(createElement(Testimonials, { items: real, showSamples: true }));
    expect(html).toContain('Real 0');
    expect(html).not.toContain(SAMPLE_TESTIMONIALS[0].name);
    expect(html).not.toContain('Sample');
  });
});
