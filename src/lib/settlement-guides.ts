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

const CONTAINER_STORE: SettlementGuide = {
  slugs: ['the-container-store-massachusetts-class-action-settlement'],
  officialUrl: 'https://www.tcssettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'CPT Group, Inc.',
  eligibilityText:
    'People who made a purchase at a The Container Store location in Massachusetts between July 20, 2011 and August 12, 2026; had a vision-related disability that requires assistive technology to access visual information at the time of the purchase; sought to credit the purchase to a new or existing Container Store loyalty-program account; and encountered a touch-screen point-of-sale kiosk or other device that lacked non-visual methods for that input.',
  typicalPayout:
    'A $780,000 settlement, with $230,000 allocated to a Damages Fund. Eligible claimants may receive $75 for each qualifying purchase, subject to a pro-rata reduction of that fund.',
  deadline: '2026-12-20',
  proof: 'unknown',
  proofDetail:
    'A claim form must be submitted by December 20, 2026. The official homepage does not say what, if anything, to attach.',
  summary:
    'A Massachusetts Container Store settlement for shoppers with a vision-related disability who could not use inaccessible POS devices to credit a loyalty purchase. Cash is claimed on the official site.',
  description:
    'Cadigan et al. v. The Container Store, Inc. covers Massachusetts in-store purchases from July 20, 2011 through August 12, 2026 by people with a vision-related disability who tried to credit a purchase to a loyalty account on an inaccessible POS device. The settlement is $780,000, with $230,000 in a Damages Fund. Valid claims may pay $75 per qualifying purchase, reduced pro rata if the fund is not enough. Claims are due December 20, 2026. CPT Group, Inc. administers the official site.',
};

const BAPTIST_HEALTH: SettlementGuide = {
  slugs: ['baptist-health-data-breach-class-action-settlement'],
  officialUrl: 'https://www.bhsettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'Simpluris',
  eligibilityText:
    'People who received notice of the Baptist Health data incident, including notice of this settlement. The incident is unauthorized access to Baptist Health Medical Center – Drew County’s network between approximately April and July 2024.',
  typicalPayout:
    'A timely claim form is the only way to receive benefits. The official homepage does not state a fixed per-person amount.',
  deadline: '2026-12-08',
  proof: 'unknown',
  proofDetail:
    'A valid claim form must be submitted or postmarked by December 8, 2026. Check the official form for what to attach.',
  summary:
    'A Baptist Health Medical Center – Drew County settlement over a 2024 data incident. Benefits are claimed on the official site.',
  description:
    'Frazier v. Baptist Health covers people who received notice of unauthorized access to Baptist Health Medical Center – Drew County’s network between about April and July 2024. Baptist Health denies wrongdoing. A timely claim form is required by December 8, 2026. The official homepage does not state a per-person amount. Simpluris administers the official site. The court still has to approve the settlement.',
};

const CBIZ_BREACH: SettlementGuide = {
  slugs: ['cbiz-data-breach-class-action-settlement'],
  officialUrl: 'https://www.cbizdatabreachsettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'Simpluris',
  eligibilityText:
    'People who were mailed notice that their personal information may have been compromised in the 2024 CBIZ Benefits & Insurance Services, Inc. data incident.',
  typicalPayout:
    'Up to $5,000 for documented out-of-pocket losses from the incident, plus a cash payment the official site estimates at roughly $100 if about 10% of the 19,990-person class files, then adjusted pro rata. Both can be combined. A timely claim form is required.',
  deadline: '2026-12-24',
  proof: 'optional',
  proofDetail:
    'A claim form is required by December 24, 2026. Documented out-of-pocket claims need records of actual losses or expenses. The official homepage does not require those records for the residual cash payment.',
  summary:
    'A CBIZ Benefits & Insurance Services settlement over a 2024 data incident. Documented losses and residual cash are claimed on the official site.',
  description:
    'In re CBIZ Data Breach Litigation covers people mailed notice that their information may have been compromised in a 2024 CBIZ incident. CBIZ denies wrongdoing. Valid claims may seek up to $5,000 in documented losses plus a residual cash payment the site estimates at about $100 at a 10% claims rate, then adjusted. Claims are due December 24, 2026. Simpluris administers the official site. The court still has to approve the settlement.',
};

const COAST_DENTAL: SettlementGuide = {
  slugs: ['coast-dental-services-unwanted-texts-calls-class-action-settlement'],
  officialUrl: 'https://cdstcpasettlement.com/',
  sourceChecked: '2026-11-24',
  eligibilityText:
    'People in the United States who, within the four years before the case was filed, received more than one text or phone call in any 12-month period reminding or encouraging a Coast Dental appointment, on a cell phone, after they had replied STOP or a similar opt-out to a Coast Dental text.',
  typicalPayout:
    'A fund of up to $3,840,664. Valid claimants may choose a pro-rata cash payment of up to $59 or a $99 voucher toward an electronic toothbrush sold by Coast Dental, after fees, costs and any service award.',
  deadline: '2026-12-24',
  proof: 'no',
  proofDetail:
    'A completed, timely Claim Form with the required affirmations is due by December 24, 2026. The official FAQ does not ask for receipts. One claim per person.',
  summary:
    'A Coast Dental TCPA/FTSA settlement over appointment texts and calls sent after a STOP request. Cash or a voucher is claimed on the official site.',
  description:
    'Chaviano v. Coast Dental Services, LLC covers U.S. people who, in the four years before filing, received more than one appointment-reminder text or call in 12 months after opting out. Coast Dental denies the claims. The fund is up to $3,840,664. Valid claims may take up to $59 cash or a $99 toothbrush voucher. Claims are due December 24, 2026. The court still has to approve the settlement.',
};

const DENTAL_INTELLIGENCE: SettlementGuide = {
  slugs: ['dental-intelligence-5-75m-privacy-class-action-settlement'],
  officialUrl: 'https://www.disettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'Simpluris',
  eligibilityText:
    'Natural persons in the United States who used the LocalMed Portal to schedule, modify, or re-schedule an appointment between March 2022 and June 2025 and who shared information that was allegedly disclosed or transmitted to a third party.',
  typicalPayout:
    'A pro rata cash payment if you submit a timely and valid claim form. The official homepage does not state a fixed per-person amount.',
  deadline: '2027-01-25',
  proof: 'unknown',
  proofDetail:
    'A timely and valid claim form must be submitted or postmarked by January 25, 2027. The official homepage does not say what, if anything, to attach.',
  summary:
    'A Dental Intelligence settlement over alleged LocalMed Portal disclosures. A pro rata cash payment is claimed on the official site.',
  description:
    'Grivetti et al. v. Dental Intelligence, Inc. covers U.S. people who used the LocalMed Portal to schedule, modify or re-schedule an appointment between March 2022 and June 2025, where information they shared was allegedly sent to a third party. Dental Intelligence denies the claims. A timely claim form is required by January 25, 2027 for a pro rata cash payment. Simpluris administers the official site. The court still has to approve the settlement.',
};

const ADAMS_TOYOTA: SettlementGuide = {
  slugs: ['adams-toyota-enviroguard-class-action-settlement'],
  officialUrl: 'https://www.adamsautosettlement.com/',
  sourceChecked: '2026-11-24',
  eligibilityText:
    'People who purchased a vehicle from Adams Auto Corp. d/b/a Adams Toyota that included an add-on purchase of the ResistAll/EnviroGuard product.',
  typicalPayout:
    'Monetary benefits if you submit a complete and verified claim form with supporting documentation. The official homepage does not state a fixed per-person amount.',
  deadline: '2027-02-11',
  proof: 'yes',
  proofDetail:
    'A complete and verified claim form with supporting documentation is required by February 11, 2027.',
  summary:
    'An Adams Toyota settlement over ResistAll/EnviroGuard add-on sales. Benefits are claimed on the official site with supporting documents.',
  description:
    'Foley v. Adams Auto Corp. covers people who bought a vehicle from Adams Toyota with a ResistAll/EnviroGuard add-on. Adams Toyota denies the claims. A complete, verified claim form with supporting documentation is due February 11, 2027. The official homepage does not state a per-person amount. The court still has to approve the settlement.',
};

const KISCO: SettlementGuide = {
  slugs: ['kisco-senior-living-data-breach-class-action-settlement'],
  officialUrl: 'https://www.kiscosettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'CPT Group, Inc.',
  eligibilityText:
    'Individual U.S. residents to whom Kisco Senior Living, LLC sent written notification of a data incident on or around June 1–6, 2023.',
  typicalPayout:
    'A $1,800,000 fund covering credit monitoring, ordinary and extraordinary out-of-pocket losses, attested time, a $250 California statutory payment for California residents at the time of the incident, and residual cash. Amounts depend on the claim type and remaining fund.',
  deadline: '2027-01-19',
  proof: 'optional',
  proofDetail:
    'A valid claim form is required by January 19, 2027. Out-of-pocket claims are listed separately from residual cash and the California statutory payment. Check the official form for what to attach.',
  summary:
    'A Kisco Senior Living settlement over a June 2023 data incident. Credit monitoring, documented losses, a California statutory payment and residual cash are claimed on the official site.',
  description:
    'Gois et al. v. Kisco Senior Living, LLC covers U.S. residents Kisco notified of a June 1–6, 2023 data incident. The fund is $1,800,000. Claims may include credit monitoring, out-of-pocket losses, attested time, $250 for California residents at the time of the incident, and residual cash. A claim form is due January 19, 2027. CPT Group, Inc. administers the official site. The court still has to approve the settlement.',
};

const EARN_COMPANY: SettlementGuide = {
  slugs: ['earn-company-fees-class-action-settlement'],
  officialUrl: 'https://www.creditexterminatorsclassaction.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People covered by Christina Atterbury v. Earn Company, et al., a Pennsylvania case alleging Credit Repair Organizations Act claims against Earn Company, Earn Finance Company LLC, Credit Exterminators Inc., Sprinkle of Jesus Corp., and named individuals. Defendants deny the claims. The official site says you are affected whether you act or not.',
  typicalPayout:
    'A $125,000.00 gross fund, payable over about two years, for class members, administration costs, Class Counsel expenses, and a service award. If the court approves the settlement as presented, you are paid a proportionate share of the net proceeds by check unless you pick an electronic method. No claim form is listed.',
  deadline: '2026-12-26',
  proof: 'no',
  proofDetail:
    'The official site does not ask you to file a claim. Do nothing to stay in the class and receive a share if the court approves. December 26, 2026 is the deadline to object. The final hearing is January 20, 2027, at 10:00 a.m. in Courtroom 636. Source: https://www.creditexterminatorsclassaction.com/',
  summary:
    'A $125,000 Earn Company / Credit Exterminators settlement. Payment is automatic if the court approves; object by December 26, 2026.',
  description:
    'Christina Atterbury v. Earn Company, et al. is a proposed Credit Repair Organizations Act settlement. The fund is $125,000.00, paid over about two years. Defendants deny the claims. The official site says doing nothing keeps you in the class and, if approved, pays a proportionate share of the net proceeds. Object by December 26, 2026. The hearing is January 20, 2027. Source: https://www.creditexterminatorsclassaction.com/',
  extraFaqs: [
    {
      q: 'Do I have to file an Earn Company claim to be paid?',
      a: 'The official site lists Do Nothing, Object, and Go to a Hearing. It does not list a claim form. Confirm on https://www.creditexterminatorsclassaction.com/ before you act.',
    },
  ],
};

const ZUMBA_VPPA: SettlementGuide = {
  slugs: ['zumba-fitness-data-privacy-class-action-settlement'],
  officialUrl: 'https://www.zumbavppasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'People who received notice of Kueppers et al. v. Zumba Fitness, LLC. Plaintiffs allege Zumba used third-party tracking technologies to send personally identifiable information about customers’ purchases to Meta, MNTN, and Pinterest under the Video Privacy Protection Act. Zumba denies wrongdoing. The Court certified a Class and three Subclasses. If you received notice by email or postal mail, Zumba’s records indicate you are a Class Member.',
  typicalPayout:
    'If you are a Class Member and do nothing, you automatically receive a Settlement payment if the Court grants final approval. The official homepage does not state a fixed per-person amount.',
  deadline: '2026-12-14',
  proof: 'no',
  proofDetail:
    'No claim form is required for payment. December 14, 2026 is the opt-out and objection deadline. Final approval is set for January 21, 2027 at 1:00 p.m. Eastern Time. Source: https://www.zumbavppasettlement.com/',
  summary:
    'A Zumba Fitness VPPA settlement. Class members who received notice are paid automatically if the court approves; opt out by December 14, 2026.',
  description:
    'Kueppers et al. v. Zumba Fitness, LLC alleges Video Privacy Protection Act tracking of purchase information. Zumba denies the claims. People who received notice are Class Members. Doing nothing means an automatic payment if the Court grants final approval. Opt out or object by December 14, 2026. Simpluris runs the official site. Source: https://www.zumbavppasettlement.com/',
  extraFaqs: [
    {
      q: 'Is there a Zumba claim form?',
      a: 'The official site says if you do nothing you automatically receive a payment if the Court grants final approval. Confirm on https://www.zumbavppasettlement.com/.',
    },
  ],
};

const ASURE_BIPA: SettlementGuide = {
  slugs: ['asure-software-bipa-settlement'],
  officialUrl: 'https://www.asurebipasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'People who, at any time between January 25, 2017 and September 17, 2026, used an Asure Software, Inc. timeclock while working at a Packers Sanitation Service location in Illinois. Vega v. Asure Software, Inc., No. 2022-CH-00651, Circuit Court of Cook County, Illinois. Asure denies that it violated BIPA.',
  typicalPayout:
    'A $644,105.00 Settlement Fund. Each Settlement Class Member who submits a timely Claim Form that is deemed valid receives an equal payment. The official FAQ estimates a net per-person payment of about $950.00–$2,800.00, depending on how many valid claims are filed.',
  deadline: '2026-12-21',
  proof: 'no',
  proofDetail:
    'A valid, timely Claim Form is due by December 21, 2026, online or mailed to Vega v. Asure Software, Inc. c/o Settlement Administrator, P.O. Box 25226, Santa Ana, CA 92799-9958. The official FAQ says submitting that form is the only thing you need to do to receive a payment. Source: https://www.asurebipasettlement.com/faq',
  summary:
    'An Asure Software BIPA settlement for Illinois Packers Sanitation workers who used an Asure timeclock. Estimated cash is about $950 to $2,800 if you file by December 21, 2026.',
  description:
    'Vega v. Asure Software, Inc. covers people who used an Asure timeclock at a Packers Sanitation Service facility in Illinois from January 25, 2017 through September 17, 2026. The fund is $644,105.00. Valid timely claims share equally; the official FAQ estimates about $950.00–$2,800.00 net. Claims are due December 21, 2026. Simpluris administers the official site. Source: https://www.asurebipasettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need extra proof for the Asure BIPA settlement?',
      a: 'The official FAQ says a valid and timely Claim Form is the only thing you need to do to receive a payment. Confirm on https://www.asurebipasettlement.com/faq.',
    },
  ],
};

const STARBUCKS_COBRA: SettlementGuide = {
  slugs: ['starbucks-welfare-benefits-plan-class-action-settlement'],
  officialUrl: 'https://cobranoticeclassaction.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'All participants not subject to Starbucks’ Arbitration Agreement, and all beneficiaries in Starbucks’ Welfare Benefits Plan, including the Health Plan and Vision Plan, in the United States who were sent a COBRA notice between July 21, 2016 through January 1, 2023, as a result of a qualifying event, as determined by Starbucks and/or its third party administrator, and who did not elect continuation coverage. Lubin v. Starbucks Corporation, M.D. Fla. Case No. 8:20-cv-01311-CEH-TGW. About 33,800 potential members. Starbucks denies the claims.',
  typicalPayout:
    'A $325,000.00 fund. Every Settlement Class Member who submits a valid claim form receives a pro-rata share of the Net Settlement Fund, which shall be disbursed in full to all Settlement Class Members.',
  deadline: '2026-12-02',
  proof: 'no',
  proofDetail:
    'The official notice says you may submit a claim by mailing a completed claim form postmarked no later than December 2, 2026. Additional instructions are in FAQ question 7 on the official site. Source: https://cobranoticeclassaction.com/',
  summary:
    'A Starbucks COBRA-notice settlement. A $325,000 fund is shared among valid mailed claims postmarked by December 2, 2026.',
  description:
    'Raphyr Lubin et al. v. Starbucks Corporation covers participants and beneficiaries in Starbucks’ Welfare Benefits Plan who were sent a COBRA notice between July 21, 2016 and January 1, 2023 after a qualifying event and did not elect continuation coverage, excluding people subject to Starbucks’ arbitration agreement. The fund is $325,000.00. Mail a claim form postmarked by December 2, 2026. Starbucks denies the claims. Source: https://cobranoticeclassaction.com/',
  extraFaqs: [
    {
      q: 'Can I file the Starbucks COBRA settlement claim online?',
      a: 'The official homepage describes mailing a completed claim form postmarked no later than December 2, 2026. Check FAQ question 7 on https://cobranoticeclassaction.com/ for any other method.',
    },
  ],
};

const BOFA_VACATION: SettlementGuide = {
  slugs: ['bank-of-america-unused-vacation-class-action-settlement'],
  officialUrl: 'https://unusedvacationsettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'Former Bank of America employees who (1) worked in California, New York, and/or Illinois during the timeframes in the official FAQ; (2) had a positive vacation balance at separation (vacation accrued in the year of separation plus vacation carried over from the prior year, if any, greater than vacation recorded in Workday as used that year); and (3) did not receive any payout for accrued but unused vacation at separation; or any Named Plaintiff to the extent otherwise not included. Nguyen et al. v. Bank of America, N.A., Case No. 5:23-cv-04999-PCP.',
  typicalPayout:
    'An Individual Settlement Payment if you do nothing. You do not have to file a claim to participate. If you believe the data on the Adjustment Form that came with the Notice is wrong, you may submit a completed Adjustment Form and supporting documentation by January 7, 2027.',
  deadline: '2027-01-07',
  proof: 'optional',
  proofDetail:
    'No claim form is required for the Individual Settlement Payment. January 7, 2027 is the deadline to opt out, object, or submit an Adjustment Form with supporting documentation if you dispute the Notice’s data. Final approval is scheduled January 28, 2027. Source: https://unusedvacationsettlement.com/',
  summary:
    'A Bank of America unused-vacation settlement for certain former employees in California, New York, or Illinois. Payment is automatic; an adjustment form is optional by January 7, 2027.',
  description:
    'Nguyen et al. v. Bank of America, N.A. covers certain former employees in California, New York, and/or Illinois with unused vacation at separation that was not paid out. The official site says you don’t have to do anything to receive an Individual Settlement Payment. Opt out, object, or submit an Adjustment Form by January 7, 2027. Source: https://unusedvacationsettlement.com/',
  extraFaqs: [
    {
      q: 'Do I file a Bank of America unused-vacation claim?',
      a: 'The official site says you don’t have to do anything to participate and be eligible for an Individual Settlement Payment. An Adjustment Form is only if you dispute the Notice’s data. Confirm on https://unusedvacationsettlement.com/.',
    },
  ],
};

const AL_PIEMONTE: SettlementGuide = {
  slugs: ['al-piemonte-nissan-tcpa-settlement-100-voucher-or-20-cash'],
  officialUrl: 'https://www.apntcpasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'Do Not Call Registry Class: All persons in the United States who from May 9, 2021 through September 1, 2026 (1) were sent a text message or received a phone call by or on behalf of Al Piemonte Nissan; (2) more than one time within any 12-month period; (3) where the person’s residential telephone number had been listed on the National Do Not Call Registry for at least thirty days prior to the communication; (4) for the purpose of selling APN’s products and services; and (5) for whom there was no established business relationship or prior express written consent. Hazem Arman v. Al Piemonte Nissan, Case No. 2026LA000850. APN denies the claims.',
  typicalPayout:
    'A Settlement Fund of up to $3,700,000.00 in vouchers or up to $740,000.00 in cash. Settlement Class Members who submit a timely claim receive a $100.00 voucher or $20.00 cash payment (member’s choice) per person, reduced pro rata if the fund is not enough. One Claim Form covers all texts and calls that person received.',
  deadline: '2026-12-15',
  proof: 'no',
  proofDetail:
    'A valid Claim Form is due by 11:59 p.m. Eastern on December 15, 2026 online, or mailed and postmarked by that date. You need the LoginID from the Notice of Settlement, or you can contact the Settlement Administrator. Source: https://www.apntcpasettlement.com/faq',
  summary:
    'An Al Piemonte Nissan TCPA settlement. A $100 voucher or $20 cash is claimed with a LoginID by December 15, 2026.',
  description:
    'Hazem Arman v. Al Piemonte Nissan covers U.S. people on the National Do Not Call Registry who got more than one marketing text or call from the dealership from May 9, 2021 through September 1, 2026. Valid timely claims may take a $100.00 voucher or $20.00 cash. Claims are due December 15, 2026 and need the LoginID from the notice. Simpluris administers the official site. Source: https://www.apntcpasettlement.com/',
  extraFaqs: [
    {
      q: 'What is the Al Piemonte Nissan LoginID?',
      a: 'The official FAQ says you will need the LoginID from the Notice of Settlement you received, or you can contact the Settlement Administrator at (866) 603-4665. Source: https://www.apntcpasettlement.com/faq',
    },
  ],
};

const MERRILL_EDGE: SettlementGuide = {
  slugs: ['merrill-lynch-39m-edge-retirement-accounts-settlement'],
  officialUrl: 'https://www.mlretirementaccountlitigation.com/',
  sourceChecked: '2026-11-25',
  administrator: 'JND Legal Administration',
  eligibilityText:
    'People who had one or more Merrill Edge Self-Directed Investing retirement accounts with cash balances swept pursuant to the Retirement Asset Savings Program (RASP) at any time from December 15, 2016 through March 15, 2020 (for example IRA, Roth IRA, Rollover IRA, Inherited IRA, SEP IRA, SIMPLE IRA). A Merrill Edge non-retirement account, or a retirement account not offered by Merrill Edge Self-Directed Investing, is not in the Class. Valelly v. Merrill Lynch, Pierce, Fenner & Smith Incorporated, Case No. 1:19-cv-07998-VEC.',
  typicalPayout:
    'A $39 million Settlement Fund. There is no need to file a claim. Payment goes into an existing Merrill Edge retirement account, or by check or electronic transfer if you no longer maintain the account. Payments under $10 will not be issued. Class Members who no longer maintain Merrill Edge retirement accounts may submit an Electronic Payment Request by March 26, 2027.',
  deadline: '2027-03-26',
  proof: 'no',
  proofDetail:
    'No claim form is required. March 26, 2027 is the deadline to choose electronic transfer instead of a check if you no longer have a Merrill Edge retirement account. Opt out or object by February 19, 2027. The settlement hearing is March 12, 2027 at 10:00 A.M. Eastern. Source: https://www.mlretirementaccountlitigation.com/',
  summary:
    'A $39 million Merrill Edge retirement-account settlement. No claim form is required; choose electronic payment by March 26, 2027 if you closed the account.',
  description:
    'Valelly v. Merrill Lynch covers Merrill Edge Self-Directed Investing retirement accounts with RASP sweeps from December 15, 2016 through March 15, 2020. The fund is $39 million. You do not need to file a claim. Payments under $10 are not issued. Electronic Payment Requests for closed accounts are due March 26, 2027. JND Legal Administration runs the official site. Source: https://www.mlretirementaccountlitigation.com/',
  extraFaqs: [
    {
      q: 'Do I file a Merrill Edge retirement settlement claim?',
      a: 'The official site says there is no need to file a claim. Closed-account holders may request electronic payment by March 26, 2027. Confirm on https://www.mlretirementaccountlitigation.com/.',
    },
  ],
};

const INDEGENE_FAX: SettlementGuide = {
  slugs: ['indegene-unwanted-faxes-class-action-settlement'],
  officialUrl: 'https://indegenetcpasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People who were successfully sent a fax on or about February 7, 2020 that states “Medical Record Review of the Impact of Adverse Events Associated with the Use of Current anti-Parkinson’s Disease Medications on Patient Clinical Therapeutics and Outcomes Trajectories in the U.S,” and offers an honorarium of $250 per eligible patient. Progressive Health and Rehab Corp. v. Indegene Inc. et al., Case No. 1:20-cv-10106, District of New Jersey. Defendants deny wrongdoing.',
  typicalPayout:
    'A share of the Settlement Fund if you complete and return a signed Claim Form. The official homepage does not state a fixed per-person amount.',
  deadline: '2026-12-09',
  proof: 'no',
  proofDetail:
    'A completed, signed Claim Form must be returned by December 9, 2026. The official homepage does not ask for receipts. Source: https://indegenetcpasettlement.com/',
  summary:
    'An Indegene TCPA fax settlement. A share of the fund is claimed with a signed form by December 9, 2026.',
  description:
    'Progressive v. Indegene covers faxes sent on or about February 7, 2020 about a medical-record-review honorarium. Defendants deny the claims. A signed Claim Form is due December 9, 2026. The official homepage does not state a per-person amount. Source: https://indegenetcpasettlement.com/',
  extraFaqs: [
    {
      q: 'What fax is in the Indegene settlement?',
      a: 'The official site describes a fax sent on or about February 7, 2020 with the title “Medical Record Review of the Impact of Adverse Events Associated with the Use of Current anti-Parkinson’s Disease Medications on Patient Clinical Therapeutics and Outcomes Trajectories in the U.S.” Source: https://indegenetcpasettlement.com/',
    },
  ],
};

const STEEL_WAREHOUSE: SettlementGuide = {
  slugs: ['steel-warehouse-company-data-breach-settlement'],
  officialUrl: 'https://www.steelwarehousedatasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'All individuals whose personal identifying information may have been compromised as a result of the January 2025 Steel Warehouse Company, LLC Data Incident, as identified on the Class List. In re: Steel Warehouse Data Incident Litigation, Cause No. 71D04-2508-CE-000011, Indiana Commercial Court, St. Joseph County Superior Court. Steel Warehouse denies wrongdoing.',
  typicalPayout:
    'One year of CyEx Financial Shield Complete credit monitoring with $1 million of financial fraud insurance, plus one cash option: up to $5,000.00 for documented out-of-pocket losses between January 23, 2025 and December 1, 2026; up to $60.00 for lost time (up to 3 hours at $20.00/hour); or a one-time $40.00 alternative cash payment with no proof.',
  deadline: '2026-12-01',
  proof: 'optional',
  proofDetail:
    'A Claim Form is due online or postmarked by December 1, 2026. The $40.00 alternative cash payment does not require proof. Out-of-pocket claims need documents such as bank statements or receipts. Lost-time claims need a brief description of the time spent. Source: https://www.steelwarehousedatasettlement.com/faq',
  summary:
    'A Steel Warehouse January 2025 data-incident settlement. Credit monitoring plus $40 cash, documented losses, or lost-time pay is claimed by December 1, 2026.',
  description:
    'In re: Steel Warehouse Data Incident Litigation covers people on the Class List whose information may have been accessed in a January 2025 cyberattack. Class members may claim one year of CyEx monitoring and one cash option, including a $40 payment with no proof. Claims are due December 1, 2026. Source: https://www.steelwarehousedatasettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need proof for the Steel Warehouse $40 cash option?',
      a: 'The official FAQ says you do not have to provide any proof or explanation to claim the one-time $40.00 alternative cash payment. Out-of-pocket claims up to $5,000.00 do need documents. Source: https://www.steelwarehousedatasettlement.com/faq',
    },
  ],
};

const BRIGHT_LENDING: SettlementGuide = {
  slugs: ['bright-lending-15-million-high-interest-loans-settlement'],
  officialUrl: 'https://brightlendingsettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'Borrowers identified as members of the Classes of borrowers who obtained a loan from Aaniiih Nakoda Finance, LLC, dba Bright Lending. Curtis Dixon et al. v. Benjamin E. Gatzke et al. Defendants deny all wrongdoing and liability.',
  typicalPayout:
    'If the Settlement is approved, each Class member will receive (1) debt cancellation and/or (2) a cash payment. Monetary Relief Class Members may update a mailing address or elect ACH, Venmo, PayPal, or Zelle instead of a paper check by December 21, 2026. Doing nothing keeps you in the class.',
  deadline: '2026-12-21',
  proof: 'no',
  proofDetail:
    'The official site does not ask you to file a claim form for the listed benefits. December 21, 2026 is the deadline for Monetary Relief Class Members to change a payment option. Source: https://brightlendingsettlement.com/',
  summary:
    'A Bright Lending settlement offering debt cancellation and/or cash. No claim form is listed; change payment method by December 21, 2026.',
  description:
    'Curtis Dixon et al. v. Benjamin E. Gatzke et al. covers Bright Lending borrowers identified as class members. If approved, each class member receives debt cancellation and/or a cash payment. The official site lists Do Nothing, change payment option by December 21, 2026, exclude, or object. Defendants deny the claims. Source: https://brightlendingsettlement.com/',
  extraFaqs: [
    {
      q: 'Do I file a Bright Lending claim form?',
      a: 'The official homepage lists Do Nothing, Change Your Payment Option, Exclude Yourself, and Object. It does not list a claim form for the listed benefits. Confirm on https://brightlendingsettlement.com/.',
    },
  ],
};

const LANE_COUNTY: SettlementGuide = {
  slugs: ['lane-county-1-35m-tax-foreclosure-class-action-settlement'],
  officialUrl: 'https://www.lanetaxforeclosuresettlement.com/',
  sourceChecked: '2026-11-24',
  administrator: 'Kroll Settlement Administration LLC',
  eligibilityText:
    'People who held, or are the heir and successor of someone who held, an ownership interest in, or a valid lien on, real property that was tax-foreclosed in Lane County, Oregon, where the statutory redemption period expired between October 12, 2017 and December 30, 2025.',
  typicalPayout:
    'A payment of surplus equity or surplus proceeds on an eligible claim. Surplus is the difference between the property’s sale price (or real market value) and unpaid taxes, fees and related costs. The official homepage does not state a fixed per-person amount.',
  deadline: '2027-02-22',
  proof: 'unknown',
  proofDetail:
    'An eligible claim form must be submitted online by 11:59 p.m. PT on February 22, 2027, or mailed and postmarked by that date. Check the official form for what to attach.',
  summary:
    'A Lane County, Oregon tax-foreclosure settlement over surplus equity. An eligible claim is required on the official site.',
  description:
    'Martin Lynch et al. v. Multnomah County et al. (Lane County) covers owners and valid lienholders of Lane County tax-foreclosed property whose statutory redemption period expired between October 12, 2017 and December 30, 2025, and their heirs. Lane County denies wrongdoing. Eligible claims may recover surplus equity or surplus proceeds. Claims are due February 22, 2027. Kroll Settlement Administration LLC administers the official site. The court still has to approve the settlement.',
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
  CONTAINER_STORE,
  BAPTIST_HEALTH,
  CBIZ_BREACH,
  COAST_DENTAL,
  DENTAL_INTELLIGENCE,
  ADAMS_TOYOTA,
  KISCO,
  LANE_COUNTY,
  EARN_COMPANY,
  ZUMBA_VPPA,
  ASURE_BIPA,
  STARBUCKS_COBRA,
  BOFA_VACATION,
  AL_PIEMONTE,
  MERRILL_EDGE,
  INDEGENE_FAX,
  STEEL_WAREHOUSE,
  BRIGHT_LENDING,
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

/**
 * The deadline people act on: an admin override when set, otherwise the
 * official notice's date when a guide has one, otherwise the feed's.
 */
/** True when PostgREST/Postgres cannot see lawsuits.deadline_override yet. */
export function isMissingDeadlineOverrideColumn(message: string | null | undefined): boolean {
  const msg = (message ?? '').toLowerCase();
  return msg.includes('deadline_override') && (msg.includes('does not exist') || msg.includes('could not find'));
}

export function guidedDeadline(row: {
  slug: string;
  deadline: string | null;
  deadline_override?: string | null;
}): string | null {
  const override = typeof row.deadline_override === 'string' ? row.deadline_override.trim() : '';
  if (override) return override.slice(0, 10);
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
> & {
  deadline_override?: string | null;
  is_test?: boolean | null;
};

/**
 * The columns a deadline, an official link or a proof rule is read from.
 * Catalog rows carry them, and so does the claim flow's SettlementRecord
 * (claims-server.ts), which has no summary, payout or administrator.
 */
interface GuidedFacts {
  slug: string;
  deadline: string | null;
  deadline_override?: string | null;
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
  const next = guide ? withOfficialFacts(row, guide, claimLinkOnSite(row.claim_url, guide)) : row;
  const deadline = guidedDeadline(next);
  return deadline === next.deadline ? next : { ...next, deadline };
}

/**
 * Overlay official-notice fields onto a catalog row. No-op when no guide
 * exists. The link is the guide's official site: the catalog, the settlement
 * page and the app's settlement screen label it "Official site" and send
 * people there to read the notice, while the claim flow keeps the feed's link
 * to the claim form (applySettlementGuideFacts).
 */
function applyDeadlineOverride<T extends GuidedLawsuit>(lawsuit: T): T {
  const deadline = guidedDeadline(lawsuit);
  return deadline === lawsuit.deadline ? lawsuit : { ...lawsuit, deadline };
}

export function applySettlementGuide<T extends GuidedLawsuit>(lawsuit: T): T {
  const guide = getSettlementGuide(lawsuit.slug);
  if (!guide) return applyDeadlineOverride(lawsuit);

  return applyDeadlineOverride({
    ...withOfficialFacts(lawsuit, guide, guide.officialUrl),
    summary: guide.summary ?? lawsuit.summary,
    description: guide.description ?? lawsuit.description,
    typical_payout: guide.typicalPayout,
    administrator: guide.administrator ?? lawsuit.administrator,
  });
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
export function catalogDeadlineFilter(
  now: Date,
  opts: { includeOverride?: boolean } = {},
): string {
  const today = todayInDeadlineZone(now);
  // Override in the filter needs migration 0050. Default off so prod keeps
  // working until the owner applies it; lookupLawsuits retries with it on.
  const open =
    opts.includeOverride === true
      ? `deadline.is.null,deadline.gte.${today},deadline_override.gte.${today}`
      : `deadline.is.null,deadline.gte.${today}`;
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
