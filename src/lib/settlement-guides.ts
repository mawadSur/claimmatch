import { proofDetail } from './proof';
import type { Lawsuit, ProofRequired } from './types';

export interface GuideFaq {
  q: string;
  a: string;
}

/**
 * Curated official-notice facts for a few high-interest catalog rows.
 *
 * Applied at read time in lawsuits.ts so ingest, admin review and the
 * database stay unchanged. A guide never creates a listing, never stamps
 * verified_at, and never invents a payout, deadline or class rule.
 *
 * Every field below was checked against the official settlement website
 * or the court-authorized notice hosted there. If a fact was not on that
 * source, it is omitted.
 */

export interface SettlementGuide {
  /** Catalog slugs this guide may overlay (aliases share one official case). */
  slugs: string[];
  /** Court-authorized settlement / claims site. */
  officialUrl: string;
  /** ISO date the official source was read. */
  sourceChecked: string;
  administrator?: string;
  eligibilityText: string;
  typicalPayout: string;
  /** Claim deadline as YYYY-MM-DD, from the official site. */
  deadline: string;
  proof: ProofRequired;
  /** Plain-language proof rule from the official notice. */
  proofDetail: string;
  summary?: string;
  description?: string;
  extraFaqs?: GuideFaq[];
}

const HYUNDAI_KIA_THEFT: SettlementGuide = {
  slugs: [
    'hyundai-kia-vehicle-theft',
    'kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners',
  ],
  officialUrl: 'https://www.hkmultistateimmobilizersettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'People who own or lease an eligible Hyundai or Kia that was not factory-equipped with an immobilizer. For cash, the vehicle needed the software upgrade installed, or a scheduled appointment for it, at the time of a qualifying theft or theft attempt on or after April 29, 2025 and before the free zinc sleeve was installed or March 31, 2027, whichever comes first. Eligible models include many 2011–2022 Hyundai Accent, Elantra, Kona, Palisade, Santa Fe, Sonata, Tucson, Venue and similar years, and many 2011–2022 Kia Forte, Optima, Rio, Sedona, Sorento, Soul, Sportage and similar years. The official site has the full model-year list.',
  typicalPayout:
    'Up to $4,500 for a total loss, up to $2,250 for a partial loss, or up to $375 for reasonable expenses after a qualifying theft attempt. A free zinc-reinforced ignition sleeve is also offered at authorized dealers. The official site says funds are limited and paid until the fund runs out.',
  deadline: '2027-03-31',
  proof: 'yes',
  proofDetail:
    'A cash claim needs records that show the software upgrade was installed or an appointment was scheduled, plus the qualifying theft or theft attempt. Check the official notice for what counts.',
  summary:
    'A multistate settlement for certain Hyundai and Kia vehicles that were not built with an immobilizer. Cash claims and a free zinc sleeve are offered on the official site.',
  description:
    'The Hyundai/Kia Multistate Immobilizer Settlement covers certain Hyundai and Kia models that were not factory-equipped with an immobilizer. People who own or lease an eligible vehicle may request a free zinc sleeve at an authorized dealer. Cash is limited to a qualifying theft or theft attempt on or after April 29, 2025, when the software upgrade was already installed or an appointment for it was scheduled, and before the zinc sleeve was installed or March 31, 2027. The official site lists payout caps of up to $4,500 (total loss), $2,250 (partial loss) or $375 (attempted theft). Claims must be submitted by March 31, 2027. The administrator says funds are limited and paid on a rolling basis until they run out.',
  extraFaqs: [
    {
      q: 'What vehicles are in the Hyundai and Kia theft settlement?',
      a: 'The official site lists many Hyundai and Kia models from about 2011 to 2022 that were not factory-equipped with an immobilizer, including Accent, Elantra, Santa Fe, Sonata, Tucson, Forte, Optima, Sorento, Soul and Sportage in certain years. Confirm your model year on the official notice before you file.',
    },
  ],
};

const HYUNDAI_KIA_AIRBAG: SettlementGuide = {
  slugs: ['hyundai-and-kia-airbag-control-unit-settlement'],
  officialUrl: 'https://www.acusettlement.com/HyundaiKia',
  sourceChecked: '2026-11-03',
  administrator: 'JND Legal Administration',
  eligibilityText:
    'People or entities who, on April 14, 2025, owned or leased, or had previously owned or leased, a Hyundai or Kia class vehicle originally sold or leased in the United States or its territories. Eligibility is by VIN. Recalled class vehicles include certain 2010–2013 Hyundai Sonata and Sonata Hybrid and certain 2010–2013 Kia Forte, Forte Koup, Optima, Optima Hybrid and Sedona. Unrecalled class vehicles include later Sonata, Sonata Hybrid, 2018–2023 Kona, 2019–2021 Veloster and later Optima and Sedona years listed on the official site.',
  typicalPayout:
    'The settlement provides $62,100,100 in payments and credits. Out-of-pocket reimbursement may cover reasonable rental, towing, childcare, ACU repair and lost-wage costs tied to a recall. Residual payments are up to $350 per class member for recalled vehicles and up to $150 for unrecalled vehicles, paid after reimbursement claims, and may be reduced if the fund is not enough.',
  deadline: '2027-04-08',
  proof: 'optional',
  proofDetail:
    'Reimbursement claims need records of the out-of-pocket costs listed on the official notice. A residual payment is claimed by submitting a claim form; the official site does not require expense receipts for that residual claim.',
  summary:
    'A $62.1 million settlement over ZF-TRW airbag control units in certain Hyundai and Kia vehicles. Residual payments and documented recall-related expenses are claimed on the official site.',
  description:
    'This is the Hyundai-Kia part of In re: ZF-TRW Airbag Control Units Products Liability Litigation. The official class is people or entities who, on April 14, 2025, owned or leased (or previously owned or leased) a listed Hyundai or Kia originally sold or leased in the United States. Check your VIN on the official site. The settlement provides $62,100,100 in payments and credits. Recalled-vehicle owners may claim reimbursement for certain reasonable recall-related costs and a residual payment of up to $350. Unrecalled-vehicle owners may claim a residual payment of up to $150. Residual amounts are set after reimbursement claims are paid. The claim deadline is April 8, 2027. JND Legal Administration runs the official site.',
  extraFaqs: [
    {
      q: 'Do I need a recalled Hyundai or Kia to claim this airbag settlement?',
      a: 'No. The official site says a residual payment is available if you submit a claim form for a recalled or unrecalled class vehicle. Out-of-pocket reimbursement is only for recalled vehicles. Confirm your VIN on the official site.',
    },
  ],
};

const REALPAGE: SettlementGuide = {
  slugs: ['realpage-rental-software-antitrust-settlement'],
  officialUrl: 'https://www.realpagerentalsettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'People and entities in the United States and its territories who paid rent on at least one multifamily residential lease directly to an owner, manager or owner-operator (including a division, subsidiary, predecessor, agent or affiliate) on a property that had a license for RealPage Revenue Management Solutions — Lease Rent Options (LRO), YieldStar (YS) and/or AI Revenue Management (AIRM) — at any time from October 18, 2018 through November 21, 2025.',
  typicalPayout:
    'A $359,925,000 settlement fund with certain landlords and property managers. The official site does not state a per-person amount. Payments will be made later; there are no payments now. You must submit a claim to be eligible for a payment from these settlements.',
  deadline: '2027-01-29',
  proof: 'optional',
  proofDetail:
    'You must submit a claim form online or have it received by 11:59 p.m. EST on January 29, 2027. The official site says to include supporting documents if they apply. Check the official claim form for what, if anything, you need to attach.',
  summary:
    'A $359.9 million settlement with certain landlords over RealPage rent-setting software. Renters who paid at a property using that software during the class period may file on the official site.',
  description:
    'The court has finally approved a $359,925,000 settlement fund in In re RealPage, Inc., Rental Software Antitrust Litigation (No. II). The class includes people and entities in the United States and its territories who paid rent on a multifamily lease directly to an owner or manager of a property licensed for RealPage LRO, YieldStar or AIRM from October 18, 2018 through November 21, 2025. Settling defendants have also agreed to change some business practices. The official site says there will be no payments now and that money will be distributed later. A claim must be submitted online or received by 11:59 p.m. EST on January 29, 2027.',
  extraFaqs: [
    {
      q: 'Does this RealPage settlement pay everyone who rented an apartment?',
      a: 'No. The official class is limited to rent paid on a multifamily property that used RealPage LRO, YieldStar or AIRM during October 18, 2018 through November 21, 2025, paid directly to the owner or manager. The official notice has the full definition and the list of settling companies.',
    },
  ],
};

const JOHN_DEERE: SettlementGuide = {
  slugs: ['john-deere-repair-services-antitrust-settlement'],
  officialUrl: 'https://www.deererepairsettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'People and entities who bought repair services for Deere large agricultural equipment from John Deere or its authorized dealers in the United States between January 10, 2018 and May 18, 2026.',
  typicalPayout:
    'A share of a $99 million cash settlement, plus interest accruing since January 15, 2026. The official notice does not state a fixed per-person amount. Plaintiffs’ expert estimates the total settlement value, including injunctive relief, at $392.9 million to $747 million. Filing a claim form is the only way to receive money. Injunctive repair-tool relief applies to the class even without a claim.',
  deadline: '2026-12-31',
  proof: 'unknown',
  proofDetail:
    'You must submit a claim form by December 31, 2026 to receive money. The official site does not say whether receipts are required. Check the official claim form for what to attach.',
  summary:
    'A $99 million cash settlement, plus repair-tool changes, for people who paid John Deere or a dealer to repair large Deere farm equipment.',
  description:
    'In re Deere & Company Repair Services Antitrust Litigation is a proposed settlement over repair tools for Deere large agricultural equipment. The class includes people and entities who bought those repair services from John Deere or its authorized dealers in the United States between January 10, 2018 and May 18, 2026. The cash fund is $99 million plus interest since January 15, 2026. The official notice does not state a per-person payment. A claim form must be submitted by December 31, 2026 to receive money. You do not need a claim form to receive the injunctive repair-tool relief. John Deere denies wrongdoing, and the court still has to approve the settlement.',
};

const KROGER: SettlementGuide = {
  slugs: ['kroger-prescription-drug-prices-class-action-settlement'],
  officialUrl: 'https://www.krogersavingsclubsettlement.com/',
  sourceChecked: '2026-11-03',
  administrator: 'Angeion Group',
  eligibilityText:
    'Individuals in the United States and its territories who, from December 9, 2018 through August 23, 2026, paid in whole or in part for one or more prescription drugs from Kroger using their insurance.',
  typicalPayout:
    'A share of a $17,000,000 settlement fund after court-approved fees, notice and administration costs and service awards. Payments are based on what the claimant paid Kroger for insured prescriptions during the class period. The official notice does not state a fixed per-person amount.',
  deadline: '2026-12-21',
  proof: 'optional',
  proofDetail:
    'A signed claim form is required by December 21, 2026. Supporting documents that identify your payments to Kroger during the class period are required if the total amount claimed is $8,000 or more.',
  summary:
    'A $17 million settlement over Kroger’s usual-and-customary prescription prices. People who paid for insured Kroger prescriptions in the class period may file on the official site.',
  description:
    'Kirkbride et al. v. The Kroger Co. is a proposed settlement about how Kroger set usual-and-customary prices on insured prescriptions. The class is individuals in the United States and its territories who paid, in whole or in part, for one or more prescription drugs from Kroger using insurance from December 9, 2018 through August 23, 2026. Kroger will pay $17,000,000. After fees and costs, the net fund is split among valid claims based on what each claimant paid. Submit a signed claim form by December 21, 2026. Claims of $8,000 or more need documents that identify the Kroger payments. Angeion Group administers the official site.',
};

const SIX_FLAGS: SettlementGuide = {
  slugs: ['six-flags-fees-california-class-action-settlement'],
  officialUrl: 'https://www.knottsgreatamericasettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'California residents charged processing fees for non-season tickets to Knott’s Berry Farm and/or Knott’s Soak City bought on knotts.com, or to California’s Great America bought on cagreatamerica.com, from June 28, 2020 to July 1, 2024.',
  typicalPayout:
    '$8 per participating class member. If you do nothing, that $8 is a credit for a future purchase on sixflags.com. If you submit a timely, valid claim form, you can take the $8 as an electronic payment or a check instead.',
  deadline: '2026-12-22',
  proof: 'no',
  proofDetail:
    'Cash instead of the $8 site credit requires a timely claim form. The official site does not ask for receipts. The claim, opt-out and objection deadline is December 22, 2026, unless a second email notice gave you 60 more days.',
  summary:
    'An $8 payment or Six Flags credit for California customers charged processing fees on certain Knott’s or Great America ticket purchases.',
  description:
    'Isayan v. Cedar Fair L.P. covers processing fees Six Flags charged Californians for non-season tickets to Knott’s Berry Farm and/or Knott’s Soak City on knotts.com, or California’s Great America on cagreatamerica.com, from June 28, 2020 to July 1, 2024. Each participating class member receives $8. Doing nothing means an $8 credit on sixflags.com. Filing a valid claim by December 22, 2026 lets you take the $8 in cash. The court has preliminarily approved the settlement; final approval is still pending.',
};

const SEATGEEK: SettlementGuide = {
  slugs: ['seatgeek-ticket-fees-nevada-class-action-settlement'],
  officialUrl: 'https://www.seatgeekticketfeessettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'People who bought electronic tickets to events in Nevada on seatgeek.com or the SeatGeek mobile app from November 7, 2020 through May 12, 2025 and were charged fees.',
  typicalPayout:
    'A pro rata share of the settlement fund based on the fees SeatGeek retained from your purchase. The official homepage does not state a fixed per-person amount. A timely claim form is the only way to receive a payment.',
  deadline: '2027-01-05',
  proof: 'no',
  proofDetail:
    'You must submit a claim form online by 11:59 p.m. EST on January 5, 2027, or mail one postmarked by that date. The official site does not ask for receipts.',
  summary:
    'A Nevada ticket-fee settlement for SeatGeek purchases. Payment is a share of the fund based on the fees SeatGeek kept, and you have to file a claim.',
  description:
    'Carbonell v. SeatGeek, Inc. alleges SeatGeek did not show the full ticket price, including fees, before Nevada event tickets were selected. SeatGeek denies the claims. The class includes people who bought electronic tickets to Nevada events on seatgeek.com or the SeatGeek app from November 7, 2020 through May 12, 2025 and were charged fees. Payment is a pro rata share of the fund based on the fees SeatGeek retained. Claims must be submitted by January 5, 2027. The official site does not ask for receipts.',
};

const DR_SQUATCH: SettlementGuide = {
  slugs: ['dr-squatch-all-natural-product-claims-settlement'],
  officialUrl: 'https://www.personalcareproductssettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'People who bought covered Dr. Squatch products in the United States from November 1, 2018 through August 29, 2026. Covered products are Dr. Squatch items labeled “natural,” including the men’s bar soap, beard oil, lotion, body wash, cologne, conditioner, deodorant, face wash, shampoo, toothpaste and other items listed on the official site. Current or former Dr. Squatch employees, officers, directors, agents and legal representatives (and their immediate families) are excluded. One claim per household.',
  typicalPayout:
    'From a $9,000,000 settlement fund: $0.50 per covered product, up to 5 products ($2.50) without proof of purchase, and up to 20 more products with a third-party retail receipt. Those can be combined, up to $12.50 before any pro-rata change. If valid claims exceed or fall short of the fund, the $0.50 rate is adjusted pro rata.',
  deadline: '2026-11-27',
  proof: 'optional',
  proofDetail:
    'You can claim up to 5 products with a signed claim form and no receipt. A point-of-purchase receipt from a third-party retailer (store or online) that shows the purchase and date is needed for up to 20 additional products. One claim form per household. Claims are due November 27, 2026.',
  summary:
    'A $9 million settlement over “natural” labeling on certain Dr. Squatch products. Small cash payments are available with or without a receipt.',
  description:
    'Guzman et al. v. Dr. Squatch, LLC covers people who bought Dr. Squatch products labeled “natural” in the United States from November 1, 2018 through August 29, 2026. Dr. Squatch agreed to a $9,000,000 fund and denies wrongdoing. A valid claim pays $0.50 per product: up to 5 products without a receipt and up to 20 with a third-party retail receipt, which can be combined (up to $12.50) before any pro-rata adjustment. Submit a claim by November 27, 2026. One claim per household.',
};

const NAVY_FEDERAL: SettlementGuide = {
  slugs: ['navy-federal-credit-union-unauthorized-personal-loan-accounts-class-action-settl'],
  officialUrl: 'https://www.nfculoansettlement.com/',
  sourceChecked: '2026-11-03',
  eligibilityText:
    'Navy Federal Credit Union members who, between January 1, 2023 and January 31, 2025, were given a personal loan where all of these were true: the application used a phone or computer that was not familiar to NFCU; NFCU deposited the loan funds into the member’s account; the member disputed the loan as fraudulent; NFCU denied that dispute in whole or in part; and NFCU has not recovered the loan funds in full. If you received a mailed or emailed notice, NFCU’s records indicate you fit this class.',
  typicalPayout:
    'Automatic relief: the listed loan is canceled, NFCU requests deletion of related credit reporting, and payments you made on the loan (including NFCU offsets) are refunded to your NFCU deposit account, or mailed if you no longer have one. An extra $250 is paid if you submit a claim form by November 29, 2026.',
  deadline: '2026-11-29',
  proof: 'no',
  proofDetail:
    'Automatic loan cancellation, credit-report deletion requests and payment refunds do not require a claim form. The extra $250 requires a signed claim form, online or mailed and postmarked by November 29, 2026. The official FAQ does not ask for receipts for that $250.',
  summary:
    'A Navy Federal settlement over unauthorized personal loans. Class members get automatic loan cancellation and refunds, plus $250 if they submit a claim form.',
  description:
    'Stacy Edey et al. v. Navy Federal Credit Union covers members who, between January 1, 2023 and January 31, 2025, received a personal loan opened from an unfamiliar device, funded into their account, disputed as fraud, denied in whole or in part, and not fully recovered. NFCU denies the claims. If the court approves the settlement, listed loans are canceled, related credit reporting is requested to be deleted, and loan payments are refunded. An extra $250 requires a claim form postmarked or submitted by November 29, 2026. The official FAQ does not ask for receipts for that $250.',
};

const KIA_WINDOWS: SettlementGuide = {
  slugs: ['kia-optima-sportage-window-regulator-settlement'],
  officialUrl: 'https://www.kiawindowregulatorsettlement.com/',
  sourceChecked: '2026-11-03',
  administrator: 'Kroll Settlement Administration LLC',
  eligibilityText:
    'Residents of the United States and the District of Columbia (not U.S. territories) who now own or lease, or previously owned or leased, a class vehicle: certain 2016–2017 Kia Optima and all 2017 Kia Sportage vehicles on Kia’s VIN list. Fleet, salvage, insurer, warranty-company and dealership owners, and people who already released these claims, are among those excluded. Confirm your VIN on the official site.',
  typicalPayout:
    'Reimbursement of out-of-pocket window-regulator repairs (parts and labor), up to 4 repairs per VIN, on a mileage tier: 100% up to $400 under 35,000 miles; 80% up to $320 at 35,001–55,000; 60% up to $240 at 55,001–75,000; 45% up to $180 at 75,001–125,000; and 40% up to $160 above 125,000 miles. Current owners or lessees may instead claim a $40 dealer service card for use at an authorized Kia service department.',
  deadline: '2026-11-23',
  proof: 'yes',
  proofDetail:
    'A claim form and required documentation are needed, whether you ask for repair reimbursement or the $40 dealer service card. Repair claims need records of what you paid at a Kia dealer or a reputable third-party shop. Claims must be submitted online or postmarked by November 23, 2026.',
  summary:
    'A Kia settlement for certain 2016–2017 Optima and 2017 Sportage window regulators. Repair reimbursement or a $40 dealer card is claimed on the official site.',
  description:
    'Le Beau et al. v. Kia America, Inc. covers U.S. and D.C. residents who own, lease or previously owned certain 2016–2017 Kia Optima or 2017 Kia Sportage class vehicles. Kia will reimburse documented out-of-pocket power-window regulator repairs, up to four per VIN, on a mileage scale from 100% (capped at $400) down to 40% (capped at $160). Current owners or lessees may take a $40 Kia dealer service card instead. A claim form and supporting documents are required by November 23, 2026. Kroll Settlement Administration LLC runs the official site. The court still has to approve the settlement.',
};

export const SETTLEMENT_GUIDES: SettlementGuide[] = [
  HYUNDAI_KIA_THEFT,
  HYUNDAI_KIA_AIRBAG,
  REALPAGE,
  JOHN_DEERE,
  KROGER,
  SIX_FLAGS,
  SEATGEEK,
  DR_SQUATCH,
  NAVY_FEDERAL,
  KIA_WINDOWS,
];

const GUIDES_BY_SLUG: ReadonlyMap<string, SettlementGuide> = new Map(
  SETTLEMENT_GUIDES.flatMap((guide) => guide.slugs.map((slug) => [slug, guide] as const)),
);

export function getSettlementGuide(slug: string): SettlementGuide | undefined {
  return GUIDES_BY_SLUG.get(slug);
}

/** Overlay official-notice fields onto a catalog row. No-op when no guide exists. */
export function applySettlementGuide<T extends Lawsuit>(lawsuit: T): T {
  const guide = getSettlementGuide(lawsuit.slug);
  if (!guide) return lawsuit;

  return {
    ...lawsuit,
    summary: guide.summary ?? lawsuit.summary,
    description: guide.description ?? lawsuit.description,
    eligibility_text: guide.eligibilityText,
    typical_payout: guide.typicalPayout,
    deadline: guide.deadline,
    administrator: guide.administrator ?? lawsuit.administrator,
    claim_url: guide.officialUrl,
    proof_required: guide.proof === 'yes',
    eligibility: {
      ...lawsuit.eligibility,
      proof: guide.proof,
    },
  };
}

export function applySettlementGuides<T extends Lawsuit>(lawsuits: T[]): T[] {
  return lawsuits.map(applySettlementGuide);
}

/** Official-notice proof sentence when a guide has one; otherwise the feed line. */
export function settlementProofDetail(lawsuit: Pick<Lawsuit, 'slug' | 'proof_required' | 'eligibility'>): string {
  const guide = getSettlementGuide(lawsuit.slug);
  if (guide?.proofDetail) return guide.proofDetail;
  return proofDetail(lawsuit);
}

export function settlementGuideFaqs(slug: string): GuideFaq[] {
  return getSettlementGuide(slug)?.extraFaqs ?? [];
}
