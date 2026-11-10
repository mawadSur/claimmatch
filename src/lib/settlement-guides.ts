import { filterOpenForClaims, type OpenRuleFields } from './open-for-claims';
import { proofDetail } from './proof';
import type { Lawsuit, ProofRequired } from './types';
import { fingerprint, formatDeadline, todayInDeadlineZone } from './utils';

export interface GuideFaq {
  q: string;
  a: string;
}

/**
 * Curated official-notice facts for a few high-interest catalog rows.
 *
 * Applied at read time wherever a deadline or official link is shown,
 * checked or scheduled: the catalog (lawsuits.ts and the app's
 * mobile/src/data/catalog.ts), the claim flow's reads (claims-server.ts: the
 * claim screen, claim writes, Your claims and the app's reminders), the
 * ingest's deadline closes and the email jobs. So ingest, admin review and the
 * database stay unchanged. A guide never creates a listing, never stamps
 * verified_at, and never invents a payout, deadline or class rule. The native
 * app overlays the copy GET /api/mobile/config serves (setGuideOverrides), so
 * an edit here reaches it without a store update.
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

const TOYOTA_AIRBAG: SettlementGuide = {
  slugs: ['toyota-airbag-control-unit-zf-trw-settlement'],
  officialUrl: 'https://www.airbagcontrolunitsettlement.com/',
  sourceChecked: '2026-11-10',
  administrator: 'Kroll Settlement Administration, LLC',
  eligibilityText:
    'People who own, lease, or previously owned or leased a subject Toyota sold or leased in the United States, D.C., Puerto Rico or other U.S. territories as of July 31, 2023. Subject vehicles: 2011–2019 Corolla, 2011–2013 Corolla Matrix, 2012–2018 Avalon, 2013–2018 Avalon HV, 2012–2019 Tacoma, 2012–2017 Tundra and 2012–2017 Sequoia. Confirm the VIN on the official site.',
  typicalPayout:
    '$78.5 million in cash and credits. Recalled-vehicle owners may claim reimbursement of certain reasonable recall-related rental, towing, childcare, ACU-repair and lost-wage costs. Anyone in the class who files a registration or claim form may receive a residual payment of up to $250 after those reimbursements. Recalled vehicles that complete the recall also get a 12-year extended new-parts warranty.',
  deadline: '2028-12-11',
  proof: 'optional',
  proofDetail:
    'Reimbursement needs a claim form plus a receipt, invoice or signed affidavit. A residual payment is claimed by submitting a registration/claim form; recall expenses are not required for that residual claim. Deadline December 11, 2028.',
  summary:
    'A $78.5 million Toyota settlement over ZF-TRW airbag control units. Residual payments and documented recall expenses are claimed on the official site.',
  description:
    'The Toyota part of In re: ZF-TRW Airbag Control Units Products Liability Litigation. Class members as of July 31, 2023 owned or leased listed Toyotas sold or leased in the United States. Check the VIN on the official site. Recalled Corolla, Matrix, Avalon and Avalon HV owners may claim certain recall-related costs. All class members, including unrecalled Tacoma, Tundra and Sequoia owners, may register for a residual of up to $250. Claims are due December 11, 2028. Kroll Settlement Administration, LLC runs the official site.',
};

const WARNER_MUSIC: SettlementGuide = {
  slugs: ['warner-music-group-1-25m-data-breach-settlement'],
  officialUrl: 'https://www.wmgdatasettlement.com/',
  sourceChecked: '2026-11-10',
  administrator: 'EisnerAmper',
  eligibilityText:
    'People living in the United States who made a payment-card purchase on an e-commerce website operated by or for a Warner Music Group subsidiary between April 25, 2020 and August 5, 2020. The California subclass is class members who lived in California during that period and made such a purchase.',
  typicalPayout:
    'A $1,250,000 fund. After fees and costs, valid claims share the remainder: one share per class member, two shares for California subclass members. The official site estimates about $50, or $100 for California subclass members. A timely claim form is the only way to receive a payment.',
  deadline: '2027-01-22',
  proof: 'optional',
  proofDetail:
    'A signed claim form must be submitted online by January 22, 2027, or mailed and postmarked by that date. The official site says a mailed form should include any supporting documentation.',
  summary:
    'A $1.25 million settlement over a 2020 payment-card incident on Warner Music Group subsidiary stores. Estimated cash is about $50, or $100 for California residents who file.',
  description:
    'In re Warner Music Group Data Breach covers U.S. residents who made a payment-card purchase on a Warner Music Group subsidiary store site between April 25, 2020 and August 5, 2020. Warner Music denies the claims. The $1,250,000 fund is shared one share per class member and two shares for California subclass members. The official site estimates about $50 or $100. Claims are due January 22, 2027. EisnerAmper administers the official site. Final approval is still pending.',
};

const TENET_PIXEL: SettlementGuide = {
  slugs: ['tenet-healthcare-pixel-tracking-settlement'],
  officialUrl: 'https://www.tenetpixelsettlement.com/',
  sourceChecked: '2026-11-10',
  administrator: 'Simpluris',
  eligibilityText:
    'Identifiable people who, from January 1, 2017 through September 18, 2023, used a website or patient portal owned or operated by Tenet Healthcare or an affiliated covered entity to create a patient-portal account, submit a webform, or check in to an urgent care or emergency room. Platforms include Tenet websites, patient portals and the Healthelife app.',
  typicalPayout:
    'A one-time $16.00 cash payment and two years of CyEx Privacy Shield Pro (dark-web and password scanning, VPN, password manager and related tools). One or both may be claimed. Enrollment codes for the privacy service were sent by postcard.',
  deadline: '2027-03-15',
  proof: 'no',
  proofDetail:
    'A claim form is required by March 15, 2027. The official FAQ says no proof or explanation is needed to claim the $16 cash payment.',
  summary:
    'A Tenet Healthcare pixel-tracking settlement. People who used listed Tenet sites or portals in the class period may claim $16 and two years of privacy monitoring.',
  description:
    'Jane Doe v. AMISUB (SFH), Inc. covers identifiable people who, from January 1, 2017 through September 18, 2023, used a Tenet website or patient portal to create a portal account, submit a webform, or check in to urgent care or an ER. Tenet denies wrongdoing. Class members may claim $16 and two years of CyEx Privacy Shield Pro. Claims are due March 15, 2027. Simpluris administers the official site. The court still has to approve the settlement.',
};

const ALLSTATE_AZ: SettlementGuide = {
  slugs: ['allstate-arizona-depreciation-settlement'],
  officialUrl: 'https://www.hernandezdepreciationsettlement.com/',
  sourceChecked: '2026-11-10',
  administrator: 'Angeion Group',
  eligibilityText:
    'Policyholders under an Allstate, Esurance, Encompass or North Light property policy who made a structural-loss claim for Arizona property from April 25, 2017 through October 1, 2026, where Allstate paid on an Xactimate estimate and withheld nonmaterial depreciation from the actual-cash-value payment. Labor-permissive policy forms, claims that exhausted policy limits, and denied or abandoned claims without an ACV payment are among those excluded.',
  typicalPayout:
    'If nonmaterial depreciation was withheld and not later paid in full: 50% of that unpaid net amount, plus 10% simple interest a year from the first ACV payment through the settlement effective date. If all outstanding depreciation was later recovered: $10 to $360, based on how much was withheld. A timely claim form is required.',
  deadline: '2027-01-29',
  proof: 'yes',
  proofDetail:
    'A signed claim form is required online before midnight Mountain Standard Time on January 29, 2027, or mailed and postmarked by that date. A representative must also submit written proof of legal authority.',
  summary:
    'An Allstate Arizona settlement over nonmaterial depreciation on structural property claims. Most claimants may seek 50% of unpaid depreciation plus 10% yearly interest.',
  description:
    'Hernandez v. Allstate Vehicle and Property Insurance Company covers Arizona structural-loss claims paid by Allstate, Esurance, Encompass or North Light from April 25, 2017 through October 1, 2026 where nonmaterial depreciation was withheld from an Xactimate-based ACV payment. Allstate denies the claims. Most people who file may receive 50% of unpaid nonmaterial depreciation plus 10% simple interest; others who later recovered depreciation may receive $10 to $360. Claims are due January 29, 2027. Angeion Group administers the official site. The court still has to approve the settlement.',
};

const CAPITAL_ONE_ARENA: SettlementGuide = {
  slugs: ['capital-one-arena-concessions-class-action-settlement'],
  officialUrl: 'https://www.venuefeesettlement.com/',
  sourceChecked: '2026-11-10',
  eligibilityText:
    'People in the United States who bought food, beverages or other items from Aramark at Capital One Arena and paid a 3% venue fee between October 1, 2024 and December 31, 2025.',
  typicalPayout:
    'A pro rata share of a $4,500,000 fund after court-approved costs, attorneys’ fees and any service award. The official site does not state a fixed per-person amount. A timely claim form is the only way to receive a payment.',
  deadline: '2026-12-04',
  proof: 'no',
  proofDetail:
    'A claim form must be submitted online or by mail by December 4, 2026. The official FAQ does not ask for receipts.',
  summary:
    'A $4.5 million settlement over a 3% Aramark venue fee on Capital One Arena concessions. Payment is a share of the fund, and a claim form is required.',
  description:
    'Alexander Garner v. Aramark Management Services LP covers people who bought food, beverages or other items from Aramark at Capital One Arena and paid a 3% venue fee between October 1, 2024 and December 31, 2025. Aramark denies wrongdoing. The fund is $4,500,000. Valid claims share what remains after fees and costs. Claims are due December 4, 2026. The official site does not ask for receipts. The court still has to approve the settlement.',
};

const HARVARD_MORGUE: SettlementGuide = {
  slugs: ['harvard-morgue-class-action-settlement'],
  officialUrl: 'https://www.harvardmorguesettlement.com/',
  sourceChecked: '2026-11-10',
  administrator: 'Simpluris',
  eligibilityText:
    'A spouse or registered domestic partner, child, parent or sibling of someone who donated their body to the Harvard Anatomical Gift Program; the designee named on the donor’s instrument of anatomical gift; someone Harvard wrote to about this matter around June 14, 2023 and/or December 7, 2023; a grandchild of a primary-class donor; or a named plaintiff. The donor’s body must have left the Harvard Morgue for cremation or burial between January 1, 2018 and March 31, 2023 (primary class) or January 1, 2003 and December 31, 2017 (pre-2018 class).',
  typicalPayout:
    '$52.5 million for the primary class and $500,000 for the pre-2018 class. Each net fund is split equally by the number of donors with timely valid claims, then allocated among the people who filed for that donor. The official site does not state a fixed per-person amount.',
  deadline: '2026-12-09',
  proof: 'yes',
  proofDetail:
    'A signed claim form must be submitted online or mailed by December 9, 2026. Check the official form for what to attach about the relationship to the donor.',
  summary:
    'A $53 million settlement for families of people who donated their bodies to Harvard’s Anatomical Gift Program. Cash is claimed on the official site.',
  description:
    'MacTaggart et al. v. President & Fellows of Harvard College is a proposed $53 million settlement ($52.5 million for donors whose remains left the morgue from January 1, 2018 through March 31, 2023, and $500,000 for 2003–2017). Relatives, designees and certain notice recipients may file. Harvard denies the allegations. Each net fund is split by donor, then among people who filed for that donor. Claims are due December 9, 2026. Simpluris administers the official site. The court still has to approve the settlement.',
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
  TOYOTA_AIRBAG,
  WARNER_MUSIC,
  TENET_PIXEL,
  ALLSTATE_AZ,
  CAPITAL_ONE_ARENA,
  HARVARD_MORGUE,
];

function bySlug(guides: readonly SettlementGuide[]): ReadonlyMap<string, SettlementGuide> {
  return new Map(guides.flatMap((guide) => guide.slugs.map((slug) => [slug, guide] as const)));
}

const GUIDES_BY_SLUG = bySlug(SETTLEMENT_GUIDES);

/** Every catalog slug a guide above overlays. */
export const GUIDED_SLUGS: readonly string[] = [...GUIDES_BY_SLUG.keys()];

let overrides: ReadonlyMap<string, SettlementGuide> | null = null;

/**
 * Native app only: the guides GET /api/mobile/config sent, in place of the
 * ones above (null puts these back). Never call this on the server, where one
 * request would change the guides of every other: the Next server ignores
 * overrides, as flags.ts does, and tests/settlement-guides.test.ts fails on
 * any use under src/.
 */
export function setGuideOverrides(guides: readonly SettlementGuide[] | null): void {
  overrides = guides ? bySlug(guides) : null;
}

/** The guides in force. NEXT_RUNTIME is set only on the Next server. */
function guidesBySlug(): ReadonlyMap<string, SettlementGuide> {
  return overrides && !process.env.NEXT_RUNTIME ? overrides : GUIDES_BY_SLUG;
}

export function getSettlementGuide(slug: string): SettlementGuide | undefined {
  return guidesBySlug().get(slug);
}

/**
 * A short fingerprint of a guide list, the same on the server and in the app
 * for the same list. GET /api/mobile/config sends it as guidesVersion and
 * leaves the list out when the app already has that one.
 */
export function guidesVersion(guides: readonly SettlementGuide[]): string {
  return fingerprint(JSON.stringify(guides));
}

/** The version of the guides above. */
export const SETTLEMENT_GUIDES_VERSION = guidesVersion(SETTLEMENT_GUIDES);

/** The deadline people act on: the official notice's when a guide has one, otherwise the feed's. */
export function guidedDeadline(row: { slug: string; deadline: string | null }): string | null {
  return getSettlementGuide(row.slug)?.deadline ?? row.deadline;
}

/**
 * The link the claim flow opens ("Open the official claim form"). With a
 * guide, the feed's link stays when it is an https link on the guide's
 * official site, where it is usually the claim form itself; any other link
 * gives way to the guide's official URL. Without a guide, the feed's link.
 */
export function guidedClaimUrl(row: { slug: string; claim_url: string | null }): string | null {
  const guide = getSettlementGuide(row.slug);
  return guide ? claimLinkOnSite(row.claim_url, guide) : row.claim_url;
}

function claimLinkOnSite(link: string | null, guide: SettlementGuide): string {
  return link && isOnGuideSite(link, guide.officialUrl) ? link : guide.officialUrl;
}

/**
 * On the guide's host or a subdomain of it ("www." aside), and inside the
 * guide's path when it points into one part of a shared site
 * (acusettlement.com/HyundaiKia). Paths compare without case.
 */
function isOnGuideSite(link: string, officialUrl: string): boolean {
  const target = httpsUrl(link);
  const site = httpsUrl(officialUrl);
  if (!target || !site) return false;
  const host = bareHost(target.hostname);
  const siteHost = bareHost(site.hostname);
  if (host !== siteHost && !host.endsWith(`.${siteHost}`)) return false;
  const section = site.pathname.replace(/\/+$/, '').toLowerCase();
  const path = target.pathname.toLowerCase();
  return !section || path === section || path.startsWith(`${section}/`);
}

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** The columns a guide overlays: the native app's catalog rows carry these, not every Lawsuit column. */
export type GuidedLawsuit = Pick<
  Lawsuit,
  | 'slug'
  | 'summary'
  | 'description'
  | 'eligibility_text'
  | 'typical_payout'
  | 'deadline'
  | 'administrator'
  | 'claim_url'
  | 'proof_required'
  | 'eligibility'
>;

/**
 * The columns a deadline, an official link or a proof rule is read from.
 * Catalog rows carry them, and so does the claim flow's SettlementRecord
 * (claims-server.ts), which has no summary, payout or administrator.
 */
interface GuidedFacts {
  slug: string;
  deadline: string | null;
  claim_url: string | null;
  eligibility_text: string | null;
  proof_required: boolean | null;
  eligibility: object | null;
}

function withOfficialFacts<T extends GuidedFacts>(row: T, guide: SettlementGuide, claimUrl: string): T {
  return {
    ...row,
    eligibility_text: guide.eligibilityText,
    deadline: guide.deadline,
    claim_url: claimUrl,
    proof_required: guide.proof === 'yes',
    eligibility: { ...row.eligibility, proof: guide.proof },
  };
}

/**
 * The claim flow's overlay (claims-server.ts and the jobs): the official
 * deadline, who-qualifies text and proof rule, and the claim link of
 * guidedClaimUrl. No-op when no guide exists.
 */
export function applySettlementGuideFacts<T extends GuidedFacts>(row: T): T {
  const guide = getSettlementGuide(row.slug);
  return guide ? withOfficialFacts(row, guide, claimLinkOnSite(row.claim_url, guide)) : row;
}

/**
 * Overlay official-notice fields onto a catalog row. No-op when no guide
 * exists. The link is the guide's official site: the catalog, the settlement
 * page and the app's settlement screen label it "Official site" and send
 * people there to read the notice, while the claim flow keeps the feed's link
 * to the claim form (applySettlementGuideFacts).
 */
export function applySettlementGuide<T extends GuidedLawsuit>(lawsuit: T): T {
  const guide = getSettlementGuide(lawsuit.slug);
  if (!guide) return lawsuit;

  return {
    ...withOfficialFacts(lawsuit, guide, guide.officialUrl),
    summary: guide.summary ?? lawsuit.summary,
    description: guide.description ?? lawsuit.description,
    typical_payout: guide.typicalPayout,
    administrator: guide.administrator ?? lawsuit.administrator,
  };
}

export function applySettlementGuides<T extends GuidedLawsuit>(lawsuits: T[]): T[] {
  return lawsuits.map(applySettlementGuide);
}

/**
 * The catalog queries' deadline filter (a PostgREST `or`): no deadline, a
 * deadline today or later in the deadline zone, or a guided slug. A guided
 * row is read whatever its feed deadline says, because the official deadline
 * replaces that one before the open-for-claims rule runs (openGuidedCatalog).
 */
export function catalogDeadlineFilter(now: Date): string {
  const open = `deadline.is.null,deadline.gte.${todayInDeadlineZone(now)}`;
  const slugs = [...guidesBySlug().keys()];
  return slugs.length > 0 ? `${open},slug.in.(${slugs.join(',')})` : open;
}

/**
 * The open catalog as the web (lookupLawsuits) and the app (fetchCatalog)
 * list it. Guides go first, so the open-for-claims rule and the order read
 * the official deadline, not the feed's.
 */
export function openGuidedCatalog<T extends GuidedLawsuit & OpenRuleFields & { is_featured?: boolean | null }>(
  rows: T[],
  now: Date,
): T[] {
  return sortByDeadline(filterOpenForClaims(applySettlementGuides(rows), now));
}

/**
 * The catalog order: soonest deadline first, then rows with no deadline;
 * featured first on the same day; otherwise the order given.
 */
export function sortByDeadline<T extends { deadline: string | null; is_featured?: boolean | null }>(
  rows: readonly T[],
): T[] {
  const featured = (row: T) => (row.is_featured ? 1 : 0);
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        compareDeadlines(a.row.deadline, b.row.deadline) || featured(b.row) - featured(a.row) || a.index - b.index,
    )
    .map(({ row }) => row);
}

/** YYYY-MM-DD dates compare as text; a missing deadline sorts last. */
function compareDeadlines(a: string | null, b: string | null): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  if (a) return -1;
  return b ? 1 : 0;
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

/** True when this slug has an official-notice guide. Does not stamp verified_at. */
export function hasOfficialNoticeGuide(slug: string): boolean {
  return Boolean(getSettlementGuide(slug));
}

/**
 * Public line when a guide was read against the official notice.
 * Null when there is no guide or the stored date cannot be shown. Never invents a date.
 */
export const CHECKED_AGAINST_NOTICE = 'Checked against the official notice on {date}';

export function noticeCheckedOnLabel(slug: string): string | null {
  const checked = getSettlementGuide(slug)?.sourceChecked?.trim();
  if (!checked) return null;
  const formatted = formatDeadline(checked);
  if (formatted === 'Varies') return null;
  return CHECKED_AGAINST_NOTICE.replace('{date}', formatted);
}
