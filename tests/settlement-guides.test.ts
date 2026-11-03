import { describe, expect, it } from 'vitest';
import { makeLawsuit } from './helpers';
import {
  SETTLEMENT_GUIDES,
  applySettlementGuide,
  getSettlementGuide,
  settlementGuideFaqs,
  settlementProofDetail,
} from '@/lib/settlement-guides';
import {
  settlementFaqs,
  settlementMetaDescription,
  settlementMetaTitle,
} from '@/lib/settlement-seo';

const REQUIRED_SLUGS = [
  'hyundai-kia-vehicle-theft',
  'hyundai-and-kia-airbag-control-unit-settlement',
  'realpage-rental-software-antitrust-settlement',
  'john-deere-repair-services-antitrust-settlement',
  'kroger-prescription-drug-prices-class-action-settlement',
  'six-flags-fees-california-class-action-settlement',
  'seatgeek-ticket-fees-nevada-class-action-settlement',
  'dr-squatch-all-natural-product-claims-settlement',
  'navy-federal-credit-union-unauthorized-personal-loan-accounts-class-action-settl',
  'kia-optima-sportage-window-regulator-settlement',
] as const;

describe('settlement guides', () => {
  it('covers ten open catalog slugs with an official https source', () => {
    const slugs = SETTLEMENT_GUIDES.flatMap((guide) => guide.slugs);
    for (const slug of REQUIRED_SLUGS) {
      expect(slugs, slug).toContain(slug);
      const guide = getSettlementGuide(slug);
      expect(guide?.officialUrl).toMatch(/^https:\/\//);
      expect(guide?.eligibilityText.length).toBeGreaterThan(40);
      expect(guide?.typicalPayout.length).toBeGreaterThan(20);
      expect(guide?.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide?.sourceChecked).toBe('2026-11-03');
    }
    expect(new Set(SETTLEMENT_GUIDES.map((g) => g.officialUrl)).size).toBe(SETTLEMENT_GUIDES.length);
  });

  it('does not invent facts on a listing without a guide', () => {
    const lawsuit = makeLawsuit(
      {},
      {
        slug: 'quiet-settlement',
        title: 'Quiet Settlement',
        typical_payout: null,
        administrator: null,
        eligibility_text: null,
        deadline: null,
        description: null,
      },
    );
    expect(applySettlementGuide(lawsuit)).toBe(lawsuit);
    expect(getSettlementGuide(lawsuit.slug)).toBeUndefined();
    expect(settlementProofDetail(lawsuit)).toContain('We don’t know if you need proof');
  });

  it('overlays official who-qualifies, payout, deadline, proof and claim URL', () => {
    const lawsuit = makeLawsuit(
      { proof: 'unknown' },
      {
        slug: 'realpage-rental-software-antitrust-settlement',
        title: 'RealPage Rental Software Antitrust Settlement',
        typical_payout: 'Varies',
        eligibility_text: null,
        administrator: null,
        deadline: '2027-01-29',
        claim_url: 'https://settlesignal.com/example',
      },
    );
    const overlaid = applySettlementGuide(lawsuit);
    expect(overlaid).not.toBe(lawsuit);
    expect(overlaid.eligibility_text).toMatch(/RealPage/);
    expect(overlaid.typical_payout).toMatch(/\$359,925,000/);
    expect(overlaid.deadline).toBe('2027-01-29');
    expect(overlaid.claim_url).toBe('https://www.realpagerentalsettlement.com/');
    expect(overlaid.eligibility.proof).toBe('optional');
    expect(overlaid.verified_at).toBeUndefined();
  });

  it('maps both Hyundai/Kia theft slugs to the same official site', () => {
    const a = getSettlementGuide('hyundai-kia-vehicle-theft');
    const b = getSettlementGuide(
      'kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners',
    );
    expect(a).toBe(b);
    expect(a?.officialUrl).toBe('https://www.hkmultistateimmobilizersettlement.com/');
  });

  it('builds Who Qualifies titles and FAQ answers from the guide, not invented reviews', () => {
    const lawsuit = applySettlementGuide(
      makeLawsuit(
        {},
        {
          slug: 'dr-squatch-all-natural-product-claims-settlement',
          title: 'Dr. Squatch "All Natural" Product Claims Settlement',
          deadline: '2026-01-01',
          eligibility_text: null,
          typical_payout: null,
        },
      ),
    );
    expect(settlementMetaTitle(lawsuit)).toMatch(/Who Qualifies, Claim Deadline & Payout$/);
    const description = settlementMetaDescription(lawsuit);
    expect(description).toMatch(/Nov 27, 2026/);
    expect(description.length).toBeLessThanOrEqual(155);

    const faqs = settlementFaqs(lawsuit);
    const text = faqs.map((f) => `${f.q} ${f.a}`).join('\n');
    expect(text).toMatch(/November 1, 2018/);
    expect(text).toMatch(/\$0\.50/);
    expect(text).toMatch(/personalcareproductssettlement\.com/);
    expect(text).not.toMatch(/testimonial|review|stars/i);
    expect(text).not.toMatch(/you(?:['’]re|\s+are)\s+eligible/i);
  });

  it('appends only the extra FAQs stored on that guide', () => {
    expect(settlementGuideFaqs('realpage-rental-software-antitrust-settlement').length).toBe(1);
    expect(settlementGuideFaqs('quiet-settlement')).toEqual([]);
    const lawsuit = applySettlementGuide(
      makeLawsuit({}, { slug: 'hyundai-and-kia-airbag-control-unit-settlement', title: 'Airbag' }),
    );
    const extras = settlementGuideFaqs(lawsuit.slug);
    expect(settlementFaqs(lawsuit).slice(-extras.length)).toEqual(extras);
  });

  it('never writes a verified stamp or user counts', () => {
    const blob = JSON.stringify(SETTLEMENT_GUIDES);
    expect(blob).not.toMatch(/verified_at/);
    expect(blob).not.toMatch(/testimonial|5 stars|users claimed/i);
    expect(blob).not.toMatch(/Sur Consulting/i);
  });
});
