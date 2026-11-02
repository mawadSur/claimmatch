import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MIN_TESTIMONIALS,
  TESTIMONIALS,
  publishableTestimonials,
  type Testimonial,
} from '@/lib/testimonials';
import { Testimonials } from '@/components/home/Testimonials';

// Test fixtures only. Real reviews live in src/lib/testimonials.ts.
const entry = (n: number): Testimonial => ({
  quote: `Quote ${n}`,
  name: `Person ${n}.`,
  receivedOn: `2026-10-0${n}`,
  source: 'email',
  consentToPublish: true,
});

describe('testimonials data', () => {
  it('every stored review is consented, dated and non-empty', () => {
    for (const t of TESTIMONIALS) {
      expect(t.consentToPublish).toBe(true);
      expect(t.receivedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.quote.trim()).not.toBe('');
      expect(t.name.trim()).not.toBe('');
    }
  });

  it('drops entries without consent, words or a real date', () => {
    const noConsent = { ...entry(1), consentToPublish: false } as unknown as Testimonial;
    const blank = { ...entry(2), quote: '   ' };
    const badDate = { ...entry(3), receivedOn: 'Oct 3' };
    expect(publishableTestimonials([noConsent, blank, badDate, entry(4)])).toEqual([entry(4)]);
  });
});

describe('<Testimonials />', () => {
  it('renders nothing outside development until there are enough real reviews', () => {
    // Vitest runs with NODE_ENV=test, so this is the production path: no
    // placeholder cards, no empty section.
    const few = Array.from({ length: MIN_TESTIMONIALS - 1 }, (_, i) => entry(i + 1));
    expect(renderToStaticMarkup(createElement(Testimonials, { items: few }))).toBe('');
  });

  it('shows each quote with its name and a permission note once there are enough', () => {
    const items = Array.from({ length: MIN_TESTIMONIALS }, (_, i) => entry(i + 1));
    const html = renderToStaticMarkup(createElement(Testimonials, { items }));
    for (const t of items) {
      expect(html).toContain(t.quote);
      expect(html).toContain(t.name);
    }
    expect(html).toContain('Shared with permission');
  });
});
