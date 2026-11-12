import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLawsuit } from './helpers';
import { addCalendarDays } from '@/lib/claim-deadlines';
import {
  GUIDED_SLUGS,
  SETTLEMENT_GUIDES,
  SETTLEMENT_GUIDES_VERSION,
  applySettlementGuide,
  applySettlementGuideFacts,
  catalogDeadlineFilter,
  getSettlementGuide,
  hasOfficialNoticeGuide,
  guidedClaimUrl,
  noticeCheckedOnLabel,
  guidedDeadline,
  guidesVersion,
  openGuidedCatalog,
  setGuideOverrides,
  settlementGuideFaqs,
  settlementProofDetail,
  sortByDeadline,
  type SettlementGuide,
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

const NEW_BATCH_SLUGS = [
  'toyota-airbag-control-unit-zf-trw-settlement',
  'warner-music-group-1-25m-data-breach-settlement',
  'tenet-healthcare-pixel-tracking-settlement',
  'allstate-arizona-depreciation-settlement',
  'capital-one-arena-concessions-class-action-settlement',
  'harvard-morgue-class-action-settlement',
] as const;

describe('settlement guides', () => {
  it('covers the original ten plus the new batch with an official https source', () => {
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
    for (const slug of NEW_BATCH_SLUGS) {
      expect(slugs, slug).toContain(slug);
      const guide = getSettlementGuide(slug);
      expect(guide?.officialUrl).toMatch(/^https:\/\//);
      expect(guide?.eligibilityText.length).toBeGreaterThan(40);
      expect(guide?.typicalPayout.length).toBeGreaterThan(20);
      expect(guide?.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide?.sourceChecked).toBe('2026-11-10');
      expect(guide?.deadline).toBeDefined();
      expect((guide?.deadline ?? '') >= '2026-11-16').toBe(true);
    }
    expect(new Set(SETTLEMENT_GUIDES.map((g) => g.officialUrl)).size).toBe(SETTLEMENT_GUIDES.length);
  });

  it('names the official-notice check date and does not invent one', () => {
    expect(hasOfficialNoticeGuide('toyota-airbag-control-unit-zf-trw-settlement')).toBe(true);
    expect(noticeCheckedOnLabel('toyota-airbag-control-unit-zf-trw-settlement')).toBe(
      'Checked against the official notice on Nov 10, 2026',
    );
    expect(noticeCheckedOnLabel('hyundai-kia-vehicle-theft')).toBe(
      'Checked against the official notice on Nov 3, 2026',
    );
    expect(hasOfficialNoticeGuide('quiet-settlement')).toBe(false);
    expect(noticeCheckedOnLabel('quiet-settlement')).toBeNull();
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

  it('overlays the Toyota airbag official site, residual cap and VIN class', () => {
    const lawsuit = makeLawsuit(
      { proof: 'unknown' },
      {
        slug: 'toyota-airbag-control-unit-zf-trw-settlement',
        title: 'Toyota Airbag Control Unit ZF-TRW Settlement',
        typical_payout: 'Varies',
        eligibility_text: null,
        administrator: null,
        deadline: '2026-01-01',
        claim_url: 'https://settlesignal.com/example',
      },
    );
    const overlaid = applySettlementGuide(lawsuit);
    expect(overlaid.typical_payout).toMatch(/\$78\.5 million/);
    expect(overlaid.typical_payout).toMatch(/\$250/);
    expect(overlaid.deadline).toBe('2028-12-11');
    expect(overlaid.claim_url).toBe('https://www.airbagcontrolunitsettlement.com/');
    expect(overlaid.administrator).toMatch(/Kroll/);
    expect(overlaid.eligibility_text).toMatch(/Corolla/);
    expect(overlaid.eligibility.proof).toBe('optional');
    const text = settlementFaqs(overlaid).map((f) => `${f.q} ${f.a}`).join('\n');
    expect(text).toMatch(/airbagcontrolunitsettlement\.com/);
    expect(text).not.toMatch(/you(?:['’]re|\s+are)\s+eligible/i);
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

describe('guides wherever a deadline or official link is read', () => {
  const SIX_FLAGS = 'six-flags-fees-california-class-action-settlement';
  const guide = getSettlementGuide(SIX_FLAGS);
  if (!guide) throw new Error('expected a guide');
  const day = (days: number) => addCalendarDays(guide.deadline, days) as string;
  /** Noon in New York, `days` after the guide's deadline. */
  const at = (days: number) => new Date(`${day(days)}T17:00:00Z`);

  // The claim flow's settlement record (claims-server SETTLEMENT_COLUMNS): no summary, payout or administrator.
  const record = (slug: string) => ({
    id: '00000000-0000-4000-8000-0000000000d1',
    slug,
    title: 'Six Flags fees',
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    deadline: day(45),
    claim_url: 'https://feed.example/six-flags',
    source_url: null,
    eligibility_text: 'Feed text.',
    eligibility: { proof: 'unknown', states: ['CA'] },
    proof_required: null,
    form_field_order: null,
  });

  it('lists every guided slug once', () => {
    expect([...GUIDED_SLUGS].sort()).toEqual(SETTLEMENT_GUIDES.flatMap((g) => g.slugs).sort());
    expect(new Set(GUIDED_SLUGS).size).toBe(GUIDED_SLUGS.length);
  });

  it('puts the official deadline, link, who-qualifies text and proof rule on a claim-flow record', () => {
    const overlaid = applySettlementGuideFacts(record(SIX_FLAGS));
    expect(overlaid).toEqual({
      ...record(SIX_FLAGS),
      deadline: guide.deadline,
      claim_url: guide.officialUrl,
      eligibility_text: guide.eligibilityText,
      proof_required: guide.proof === 'yes',
      eligibility: { proof: guide.proof, states: ['CA'] },
    });
    expect(overlaid).not.toHaveProperty('summary');
    expect(overlaid).not.toHaveProperty('typical_payout');

    const plain = record('plain-settlement');
    expect(applySettlementGuideFacts(plain)).toBe(plain);
    expect(applySettlementGuideFacts({ ...record(SIX_FLAGS), eligibility: null }).eligibility).toEqual({ proof: guide.proof });
  });

  it('applySettlementGuide still overlays the same facts plus summary and payout', () => {
    const lawsuit = makeLawsuit({}, { slug: SIX_FLAGS, deadline: day(45), claim_url: 'https://feed.example/x' });
    expect(applySettlementGuide(lawsuit)).toMatchObject({
      ...applySettlementGuideFacts(lawsuit),
      summary: guide.summary,
      typical_payout: guide.typicalPayout,
    });
  });

  it('guidedDeadline is the official deadline when there is a guide', () => {
    expect(guidedDeadline({ slug: SIX_FLAGS, deadline: day(45) })).toBe(guide.deadline);
    expect(guidedDeadline({ slug: SIX_FLAGS, deadline: null })).toBe(guide.deadline);
    expect(guidedDeadline({ slug: 'plain-settlement', deadline: '2027-01-01' })).toBe('2027-01-01');
    expect(guidedDeadline({ slug: 'plain-settlement', deadline: null })).toBeNull();
  });

  it('the catalog query reads every guided row, whatever its feed deadline', () => {
    // 01:00 UTC on Nov 9 is still Nov 8 in New York (the deadline zone).
    expect(catalogDeadlineFilter(new Date('2026-11-09T01:00:00Z'))).toBe(
      `deadline.is.null,deadline.gte.2026-11-08,slug.in.(${GUIDED_SLUGS.join(',')})`,
    );
  });

  it('a feed deadline later than the official one lists and sorts by the official one', () => {
    const rows = [
      makeLawsuit({}, { id: 'a', slug: 'plain-settlement', deadline: day(3) }),
      makeLawsuit({}, { id: 'b', slug: SIX_FLAGS, deadline: day(45), claim_url: 'https://feed.example/x' }),
    ];
    const open = openGuidedCatalog(rows, at(-10));
    expect(open.map((l) => [l.slug, l.deadline, l.claim_url])).toEqual([
      [SIX_FLAGS, guide.deadline, guide.officialUrl],
      ['plain-settlement', day(3), rows[0].claim_url],
    ]);
  });

  it('a passed official deadline is not open, whatever the feed says', () => {
    const rows = [makeLawsuit({}, { id: 'b', slug: SIX_FLAGS, deadline: day(45) })];
    expect(openGuidedCatalog(rows, at(0)).map((l) => l.slug)).toEqual([SIX_FLAGS]); // the last day
    expect(openGuidedCatalog(rows, at(1))).toEqual([]);
    // A feed deadline that passed first still lists until the official one.
    expect(openGuidedCatalog([makeLawsuit({}, { slug: SIX_FLAGS, deadline: day(-20) })], at(-1))).toHaveLength(1);
  });

  it('sorts soonest deadline first, featured first on the same day, no deadline last, otherwise as given', () => {
    const rows = [
      { slug: 'none', deadline: null, is_featured: true },
      { slug: 'later', deadline: '2027-02-01', is_featured: false },
      { slug: 'same-a', deadline: '2027-01-01', is_featured: false },
      { slug: 'same-featured', deadline: '2027-01-01', is_featured: true },
      { slug: 'same-b', deadline: '2027-01-01', is_featured: false },
      { slug: 'none-2', deadline: null, is_featured: false },
    ];
    expect(sortByDeadline(rows).map((r) => r.slug)).toEqual(['same-featured', 'same-a', 'same-b', 'later', 'none', 'none-2']);
    expect(rows[0].slug).toBe('none'); // the input is not reordered
  });
});

describe('the claim link: the feed’s form on the official site, otherwise the official site', () => {
  const guide = getSettlementGuide('six-flags-fees-california-class-action-settlement') as SettlementGuide;
  const airbag = getSettlementGuide('hyundai-and-kia-airbag-control-unit-settlement') as SettlementGuide;
  const link = (slug: string, claim_url: string | null) => guidedClaimUrl({ slug, claim_url });
  const SIX = guide.slugs[0];
  const AIRBAG = airbag.slugs[0];

  it('keeps an https link on the official host, a subdomain of it, or the same host with or without www.', () => {
    expect(guide.officialUrl).toBe('https://www.knottsgreatamericasettlement.com/');
    for (const kept of [
      'https://www.knottsgreatamericasettlement.com/submit-claim',
      'https://knottsgreatamericasettlement.com/submit-claim?ref=notice',
      'https://claims.knottsgreatamericasettlement.com/form',
      'https://WWW.KnottsGreatAmericaSettlement.com/Claim',
    ]) {
      expect(link(SIX, kept), kept).toBe(kept);
    }
  });

  it('gives way to the official site for another host, a lookalike, plain http, or no usable link', () => {
    for (const replaced of [
      'https://settlesignal.com/settlements/six-flags/',
      'https://knottsgreatamericasettlement.com.example.net/claim',
      'https://evilknottsgreatamericasettlement.com/claim',
      'https://www.knottsgreatamericasettlement.com@phish.example.net/claim',
      'http://www.knottsgreatamericasettlement.com/submit-claim',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
    ]) {
      expect(link(SIX, replaced), String(replaced)).toBe(guide.officialUrl);
    }
  });

  it('stays inside the guide’s part of a site that hosts several settlements', () => {
    expect(airbag.officialUrl).toBe('https://www.acusettlement.com/HyundaiKia');
    // The live feed's form, in another case than the guide's path.
    expect(link(AIRBAG, 'https://www.acusettlement.com/hyundaikia/claim')).toBe('https://www.acusettlement.com/hyundaikia/claim');
    expect(link(AIRBAG, 'https://www.acusettlement.com/HyundaiKia')).toBe('https://www.acusettlement.com/HyundaiKia');
    for (const elsewhere of ['https://www.acusettlement.com/', 'https://www.acusettlement.com/Toyota/claim', 'https://www.acusettlement.com/HyundaiKiaOld']) {
      expect(link(AIRBAG, elsewhere), elsewhere).toBe(airbag.officialUrl);
    }
  });

  it('leaves a settlement without a guide alone', () => {
    expect(link('plain-settlement', 'https://feed.example/claim')).toBe('https://feed.example/claim');
    expect(link('plain-settlement', null)).toBeNull();
  });

  it('is the claim flow’s link; the catalog and settlement page keep the official site', () => {
    const form = 'https://www.knottsgreatamericasettlement.com/submit-claim';
    const row = makeLawsuit({}, { slug: SIX, claim_url: form });
    expect(applySettlementGuideFacts(row).claim_url).toBe(form);
    expect(applySettlementGuide(row).claim_url).toBe(guide.officialUrl);
    expect(openGuidedCatalog([row], new Date('2026-11-08T17:00:00Z'))[0].claim_url).toBe(guide.officialUrl);
  });
});

describe('the app’s copy of the guides (setGuideOverrides)', () => {
  const SIX = 'six-flags-fees-california-class-action-settlement';
  const served = SETTLEMENT_GUIDES.map((guide) => ({ ...guide }));
  const edited: SettlementGuide = {
    ...(getSettlementGuide(SIX) as SettlementGuide),
    deadline: '2027-02-15',
    proofDetail: 'Edited proof rule.',
    extraFaqs: [{ q: 'Edited?', a: 'Yes.' }],
  };
  const added: SettlementGuide = { ...edited, slugs: ['new-guided-settlement'], officialUrl: 'https://www.new-settlement.com/' };

  afterEach(() => {
    setGuideOverrides(null);
    vi.unstubAllEnvs();
  });

  it('omits the checked line when a guide has no readable date', () => {
    setGuideOverrides([{ ...edited, sourceChecked: '' }]);
    expect(hasOfficialNoticeGuide(SIX)).toBe(true);
    expect(noticeCheckedOnLabel(SIX)).toBeNull();
    setGuideOverrides([{ ...edited, sourceChecked: 'not-a-date' }]);
    expect(noticeCheckedOnLabel(SIX)).toBeNull();
  });

  it('replaces the guides every helper reads, and null puts the compiled ones back', () => {
    setGuideOverrides([...served.filter((g) => !g.slugs.includes(SIX)), edited, added]);
    const row = makeLawsuit({}, { slug: SIX, deadline: '2026-12-01' });
    expect(guidedDeadline(row)).toBe('2027-02-15');
    expect(applySettlementGuide(row).deadline).toBe('2027-02-15');
    expect(settlementProofDetail(row)).toBe('Edited proof rule.');
    expect(settlementGuideFaqs(SIX)).toEqual([{ q: 'Edited?', a: 'Yes.' }]);
    expect(getSettlementGuide('new-guided-settlement')?.officialUrl).toBe('https://www.new-settlement.com/');
    expect(catalogDeadlineFilter(new Date('2026-11-08T17:00:00Z'))).toContain(',new-guided-settlement)');

    setGuideOverrides(null);
    expect(guidedDeadline(row)).toBe(getSettlementGuide(SIX)?.deadline);
    expect(getSettlementGuide('new-guided-settlement')).toBeUndefined();
  });

  it('drops a guide the server no longer has, and an empty list reads every row by its own deadline', () => {
    setGuideOverrides([]);
    expect(getSettlementGuide(SIX)).toBeUndefined();
    const row = makeLawsuit({}, { slug: SIX, deadline: '2026-12-01' });
    expect(applySettlementGuide(row)).toBe(row);
    expect(catalogDeadlineFilter(new Date('2026-11-08T17:00:00Z'))).toBe('deadline.is.null,deadline.gte.2026-11-08');
  });

  it('is ignored on the Next server, so a stray call cannot change the guides of every request', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    setGuideOverrides([]);
    expect(getSettlementGuide(SIX)).toBe(SETTLEMENT_GUIDES.find((g) => g.slugs.includes(SIX)));
  });

  it('is called nowhere under src/ but its definition (the app calls it: mobile/src/data/guides.ts)', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return files(file);
        return /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
      });
    const src = path.join(process.cwd(), 'src');
    const definition = path.join(src, 'lib', 'settlement-guides.ts');
    const users = files(src).filter((file) => file !== definition && /\bsetGuideOverrides\b/.test(readFileSync(file, 'utf8')));
    expect(users).toEqual([]);
  });
});

describe('guidesVersion', () => {
  it('fingerprints a guide list: the same list (also after a JSON round trip) gives the same version', () => {
    expect(SETTLEMENT_GUIDES_VERSION).toMatch(/^[0-9a-z]{6,14}$/);
    expect(guidesVersion(SETTLEMENT_GUIDES)).toBe(SETTLEMENT_GUIDES_VERSION);
    expect(guidesVersion(JSON.parse(JSON.stringify(SETTLEMENT_GUIDES)))).toBe(SETTLEMENT_GUIDES_VERSION);
  });

  it('changes when any fact changes, and when a guide is added or dropped', () => {
    const [first, ...rest] = SETTLEMENT_GUIDES;
    expect(guidesVersion([{ ...first, deadline: '2027-04-01' }, ...rest])).not.toBe(SETTLEMENT_GUIDES_VERSION);
    expect(guidesVersion([{ ...first, proofDetail: `${first.proofDetail} ` }, ...rest])).not.toBe(SETTLEMENT_GUIDES_VERSION);
    expect(guidesVersion(rest)).not.toBe(SETTLEMENT_GUIDES_VERSION);
    expect(guidesVersion([])).not.toBe(guidesVersion(rest));
  });
});
