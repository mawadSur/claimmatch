import { describe, expect, it } from 'vitest';
import {
  catalogGuideFaqs,
  catalogGuideSections,
  catalogGuideSummary,
  catalogHowToFile,
} from '@/lib/catalog-guides';
import { hasOfficialNoticeGuide } from '@/lib/settlement-guides';
import { makeLawsuit } from './helpers';

describe('catalog-templated settlement guides', () => {
  it('builds sections from stored fields only and never invents a payout', () => {
    const lawsuit = makeLawsuit(
      { proof: 'optional' },
      {
        title: 'Quiet Settlement',
        slug: 'quiet-settlement',
        typical_payout: null,
        eligibility_text: 'Open to eligible US residents.',
        deadline: null,
        administrator: null,
        category: 'Privacy',
      },
    );
    const sections = catalogGuideSections(lawsuit);
    expect(sections.payout).toContain('does not state a payout amount');
    expect(sections.payout).not.toMatch(/\$\d/);
    expect(sections.qualifies).toMatch(/don’t have the official rules|don't have the official rules/i);
    expect(sections.deadline).toContain('no deadline');
    expect(sections.howToFile).toContain('We help you file');
    expect(sections.howToFile).not.toContain('We file this claim for you');
    expect(JSON.stringify(sections)).not.toMatch(/15\s?%/);
  });

  it('repeats listed payout and eligibility text when the catalog has them', () => {
    const lawsuit = makeLawsuit(
      { proof: 'no' },
      {
        title: 'Widget Settlement',
        slug: 'widget-settlement',
        eligibility_text: 'People who bought a Widget in California in 2023.',
        typical_payout: 'Up to $40',
        deadline: '2026-11-15',
      },
    );
    const sections = catalogGuideSections(lawsuit);
    expect(sections.qualifies).toContain('People who bought a Widget in California in 2023.');
    expect(sections.payout).toContain('Up to $40');
    expect(sections.deadline).toContain('Nov 15, 2026');
    expect(sections.proof.toLowerCase()).toContain('don’t need proof');

    const faqs = catalogGuideFaqs(lawsuit);
    expect(faqs.some((f) => f.a.includes('Up to $40'))).toBe(true);
    expect(faqs.some((f) => f.a.includes('People who bought a Widget'))).toBe(true);
    expect(faqs.map((f) => f.a).join(' ')).not.toMatch(/15\s?%/);
  });

  it('uses we-file-this-claim only on an agent lane', () => {
    const lawsuit = makeLawsuit({}, { title: 'Acme Settlement', claim_url: 'https://official.example.test/claim' });
    expect(catalogHowToFile(lawsuit, false)).toContain('We help you file');
    expect(catalogHowToFile(lawsuit, true)).toContain('We file this claim for you');
  });

  it('skips extra FAQs when the slug already has an official-notice overlay', () => {
    const lawsuit = makeLawsuit(
      {},
      {
        slug: 'hyundai-and-kia-airbag-control-unit-settlement',
        title: 'Hyundai and Kia Airbag Control Unit Settlement',
      },
    );
    expect(hasOfficialNoticeGuide(lawsuit.slug)).toBe(true);
    expect(catalogGuideFaqs(lawsuit)).toEqual([]);
  });

  it('does not invent a summary payout', () => {
    const summary = catalogGuideSummary(
      makeLawsuit({}, { title: 'Quiet Settlement', summary: null, typical_payout: null, deadline: null, category: 'Privacy' }),
    );
    expect(summary).toContain('Quiet Settlement');
    expect(summary).toContain('Privacy');
    expect(summary).not.toMatch(/\$\d/);
  });
});
