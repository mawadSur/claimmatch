import type { SettlementGuide } from './settlement-guides';

/**
 * Official-notice guides checked on 2026-11-25 against each settlement's
 * court-authorized website. Facts that were not on that source are omitted.
 * Deadlines match the official site and the public catalog date where both agree.
 */

const ADAPT_HEALTH: SettlementGuide = {
  slugs: ['adapthealth-14-3m-north-carolina-debt-collection-settlement'],
  officialUrl: 'https://www.ncadapthealthsettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'JND Legal Administration',
  eligibilityText:
    'People who purchased, leased, or rented medical equipment, supplies, and/or other products from AdaptHealth or any of AdaptHealth’s Family of Companies may be in one of two settlement classes. Settlement Class A (Billing Claim Class) covers dates of service between April 3, 2019 and April 3, 2025. Settlement Class C (Collection Letter Claim Class) covers people who were sent a “Seriously Past Due” or “Final Demand” letter suggesting possible legal action, where the letter was associated with dates of service between April 3, 2019 and March 31, 2026, who lived in North Carolina when the letter was sent, and who are among the 142,539 people AdaptHealth’s records identified as meeting those criteria. The official site has the full class definitions. Settlement Class B (Late Fee Class) is being resolved without financial or other relief. AdaptHealth denies the claims. The court has not decided who is right.',
  typicalPayout:
    'AdaptHealth has agreed to pay a Settlement Amount of $14,311,500. A $1,624,000 fund for Settlement Class A pays $3,500.00 per eligible person who submits a valid claim. A $6,700,000 fund for Settlement Class C pays $47.00 automatically to eligible people who received a Class C notice by mail or email; people who did not receive that notice need a valid claim form. Remaining funds may be distributed pro rata. No portion of the Settlement Amount will be returned to AdaptHealth.',
  deadline: '2026-12-08',
  proof: 'optional',
  proofDetail:
    'Class A members need a valid claim form by 11:59 p.m. Eastern on December 8, 2026 to be eligible for the $3,500 payment. Class C members who received a settlement notice are paid automatically and do not need a claim form. Class C members who did not receive a notice need a valid claim form. Source: https://www.ncadapthealthsettlement.com/',
  summary:
    'A $14,311,500 North Carolina AdaptHealth settlement over billing and collection-letter claims. Class A claims and some Class C claims are due December 8, 2026.',
  description:
    'Jerry W. Ray v. AdaptHealth Corp., No. 1:22-cv-00898-TDS-JGM, is a proposed settlement over alleged improper billing and collection letters under North Carolina law. AdaptHealth denies wrongdoing. The Settlement Amount is $14,311,500. Eligible Class A members who file a valid claim may receive $3,500.00. Eligible Class C members who received notice are to receive $47.00 automatically; others in Class C need a claim form. Claims, exclusions, and objections are due December 8, 2026, at 11:59 p.m. Eastern. JND Legal Administration administers the official site. The court still has to approve the settlement. Source: https://www.ncadapthealthsettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need a claim form for the AdaptHealth collection-letter payment?',
      a: 'The official site says eligible Settlement Class C members who received a notice by mail or email will get the $47.00 payment automatically. If you did not receive that notice, you need a valid claim form by December 8, 2026. Confirm on https://www.ncadapthealthsettlement.com/.',
    },
  ],
};

const ECSI_BREACH: SettlementGuide = {
  slugs: ['educational-computer-systems-data-breach-class-action-settlement'],
  officialUrl: 'https://www.datasettlementecsi.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose personal identifying information was impacted by a criminal cyberattack on Educational Computer Systems, Inc.’s website between October 29, 2023 and February 12, 2024 may be eligible. The case is Hood, et al. v. Educational Computer Systems, Inc., in the U.S. District Court for the Western District of Pennsylvania. Read the official notice for the class definition.',
  typicalPayout:
    'You may claim reimbursement for documented unreimbursed losses more likely than not caused by the Security Incident, up to $5,000.00, or in the alternative an Alternative Cash Payment estimated at about $100.00, which may be reduced or increased pro rata depending on the number of approved claims. You must submit a valid claim form to receive money.',
  deadline: '2026-12-21',
  proof: 'optional',
  proofDetail:
    'A valid claim form must be submitted online or mailed and postmarked by December 21, 2026. Documented out-of-pocket loss claims need supporting records. The official site does not require documentation for the Alternative Cash Payment. Source: https://www.datasettlementecsi.com/',
  summary:
    'An Educational Computer Systems settlement over a late-2023 to early-2024 website cyberattack. Claims are due December 21, 2026.',
  description:
    'Hood, et al. v. Educational Computer Systems, Inc. covers people whose personal information was impacted by a cyberattack on ECSI’s website between October 29, 2023 and February 12, 2024. Valid claims may seek documented losses up to $5,000.00 or an Alternative Cash Payment estimated at about $100.00, subject to pro rata adjustment. Claim forms are due December 21, 2026. Exclusion and objection deadlines on the official site were November 20, 2026. The final hearing is January 11, 2027. The court still has to approve the settlement. Source: https://www.datasettlementecsi.com/',
};

const EFI_BREACH: SettlementGuide = {
  slugs: ['electronics-for-imaging-data-breach-class-action-settlement'],
  officialUrl: 'https://efidatasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'People whose private information was impacted in the September 2024 Electronics for Imaging, Inc. data incident may be affected. The official site says the targeted cyberattack accessed certain files that may have contained first, middle, and last names, addresses, phone numbers, dates of birth, photo identification and/or driver’s licenses, and Social Security numbers. The case is Hibbard, Nelson v. Electronics for Imaging, Inc., No. 217-2025-CV-00528, in the Superior Court of Merrimack County, New Hampshire. EFI denies that it did anything wrong. The court has not decided who is right.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2026-12-22',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by December 22, 2026. Check the official form for what, if anything, to attach. Source: https://efidatasettlement.com/',
  summary:
    'An Electronics for Imaging settlement over a September 2024 data incident. Claims are due December 22, 2026.',
  description:
    'Hibbard, Nelson v. Electronics for Imaging, Inc. covers a September 2024 cyberattack on EFI’s systems. EFI denies wrongdoing. A valid claim form is due December 22, 2026. The official homepage does not state a fixed per-person amount. Objection and opt-out deadlines on the official site were November 23, 2026. The final hearing is January 26, 2027, at 8:30 a.m. ET. Simpluris administers the official site. The court still has to approve the settlement. Source: https://efidatasettlement.com/',
};

const HOLT_GROUP: SettlementGuide = {
  slugs: ['holt-group-data-breach-class-action-settlement'],
  officialUrl: 'https://holtgroupdatasettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'People who received notice of a December 2024 targeted criminal third-party cyberattack on the network of B.D. Holt Co. d/b/a Holt Group may be class members. The official site says Holt Group’s records indicate that people who received notice are class members. Files that may have been accessed may have contained some combination of names, Social Security numbers, driver’s license numbers, and financial account information. Read the official notice for the class definition.',
  typicalPayout:
    'The official site says you may be entitled to benefits if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2026-12-01',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits is to submit a valid and timely claim form, online or by mail, by December 1, 2026. Check the official form for what, if anything, to attach. Source: https://holtgroupdatasettlement.com/',
  summary:
    'A Holt Group settlement over a December 2024 data incident. Claims are due December 1, 2026.',
  description:
    'A proposed settlement with B.D. Holt Co. d/b/a Holt Group covers a December 2024 cyberattack on Holt Group’s network. People who received notice may be class members. A valid claim form is due December 1, 2026. The official homepage does not state a fixed per-person amount. The official site listed an objection deadline of November 16, 2026, and a final hearing on December 16, 2026. Simpluris administers the official site. The court still has to approve the settlement. Source: https://holtgroupdatasettlement.com/',
};

const PILLSBURY_BREACH: SettlementGuide = {
  slugs: ['pillsbury-law-firm-data-breach-settlement'],
  officialUrl: 'https://www.pillsburydatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People notified that their private information may have been compromised in the April 2025 Pillsbury Winthrop Shaw Pittman LLP incident may be affected. The case is Allison Archer v. Pillsbury Winthrop Shaw Pittman LLP. Read the official notice for the class definition. The defendant denies that it did anything wrong. The court has not decided who is right.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2026-12-07',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by December 7, 2026. Check the official form for what, if anything, to attach. Source: https://www.pillsburydatasettlement.com/',
  summary:
    'A Pillsbury Winthrop Shaw Pittman settlement over an April 2025 data incident. Claims are due December 7, 2026.',
  description:
    'Allison Archer v. Pillsbury Winthrop Shaw Pittman LLP covers people notified that their private information may have been compromised in an April 2025 incident. A valid claim form is due December 7, 2026. The official homepage does not state a fixed per-person amount. Opt-out and objection deadlines on the official site are also December 7, 2026. The final hearing is December 22, 2026, at 8:45 a.m. EST. The court still has to approve the settlement. Source: https://www.pillsburydatasettlement.com/',
};

const USC_ARCADIA: SettlementGuide = {
  slugs: ['usc-arcadia-hospital-data-privacy-class-action-settlement'],
  officialUrl: 'https://uscarcadiahospitalsettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'People who completed a form on the USC Arcadia Hospital website to sign up for email or event updates from February 1, 2022, to January 31, 2023 may be affected by Merle v. USC Arcadia Hospital, Case No. 23STCV01900. The official site says that if you received notice, USC Arcadia Hospital records indicate you are a class member. Read the official notice for the full class definition.',
  typicalPayout:
    'A timely, valid claim form is required to receive a cash payment. Class members do not need a claim form to receive one year of CyEx Privacy Shield Pro, but the service must be activated by March 15, 2027, using the unique activation code in the notice. The official homepage does not state a fixed cash amount.',
  deadline: '2026-12-07',
  proof: 'optional',
  proofDetail:
    'Submit a timely, valid claim form by December 7, 2026, to receive a cash payment. Credit-monitoring enrollment uses the activation code in the notice and must be completed by March 15, 2027. Source: https://uscarcadiahospitalsettlement.com/',
  summary:
    'A USC Arcadia Hospital settlement for people who signed up for email or event updates in 2022–2023. Cash claims are due December 7, 2026.',
  description:
    'Merle v. USC Arcadia Hospital, Case No. 23STCV01900, covers people who completed a sign-up form on the hospital website from February 1, 2022, to January 31, 2023. A cash claim is due December 7, 2026. One year of CyEx Privacy Shield Pro is available without a cash claim if activated by March 15, 2027. The official homepage does not state a fixed cash amount. Opt-out and objection deadlines on the official site are also December 7, 2026. The final hearing is December 14, 2026. Simpluris administers the official site. The court still has to approve the settlement. Source: https://uscarcadiahospitalsettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need a claim form for the USC Arcadia Hospital credit-monitoring benefit?',
      a: 'The official site says class members do not need a claim form to receive one year of CyEx Privacy Shield Pro, but the service must be activated by March 15, 2027, with the unique code in the notice. A claim form is required for a cash payment. Confirm on https://uscarcadiahospitalsettlement.com/.',
    },
  ],
};

const RIVERSIDE_CASINO: SettlementGuide = {
  slugs: ['riverside-resort-casino-data-breach-settlement'],
  officialUrl: 'https://riversidedatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was impacted in a data incident involving Riverside Resort & Casino may be affected. Read the official notice for the class definition and the incident details. The defendants deny that they did anything wrong. The court has not decided who is right.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2027-01-04',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by January 4, 2027. Check the official form for what, if anything, to attach. Source: https://riversidedatasettlement.com/',
  summary:
    'A Riverside Resort & Casino settlement over a data incident. Claims are due January 4, 2027.',
  description:
    'A proposed settlement with Riverside Resort & Casino covers a data incident affecting private information. A valid claim form is due January 4, 2027. The official homepage does not state a fixed per-person amount. Objection and opt-out deadlines on the official site are December 4, 2026. The final hearing is January 27, 2027. The court still has to approve the settlement. Source: https://riversidedatasettlement.com/',
};

const BENWORTH_CAPITAL: SettlementGuide = {
  slugs: ['benworth-capital-data-breach-settlement'],
  officialUrl: 'https://benworthdatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'You are a settlement class member if you are a living individual residing in the United States who was sent notice by Benworth Capital Partners LLC that your private information may have been impacted in a data incident on or about May 18, 2025. The official site says the incident resulted in unauthorized access to or acquisition of private information collected by the defendant, including names, addresses, Social Security numbers, and telephone numbers. The case is Amanda Arreola, et al. v. Benworth Capital Partners LLC.',
  typicalPayout:
    'Cash Payment Option 1 covers reasonable documented losses fairly traceable to the data incident, up to $5,000.00, and requires documentation. Cash Payment Option 2 is an estimated cash payment of $50.00 and does not require documentation of losses.',
  deadline: '2026-12-21',
  proof: 'optional',
  proofDetail:
    'Submit a claim online or by mail postmarked by December 21, 2026. Documented-loss claims need supporting records. The official site does not require documentation for the estimated $50.00 alternative cash option. Source: https://benworthdatasettlement.com/',
  summary:
    'A Benworth Capital Partners settlement over a May 18, 2025 data incident. Claims are due December 21, 2026.',
  description:
    'Amanda Arreola, et al. v. Benworth Capital Partners LLC covers U.S. residents who were sent notice that their private information may have been impacted in a May 18, 2025 data incident. Valid claims may seek documented losses up to $5,000.00 or an estimated $50.00 alternative cash payment. Claims are due December 21, 2026. The official site also lists dates of December 4, 2026, and a January 5, 2027 hearing. The court still has to approve the settlement. Source: https://benworthdatasettlement.com/',
};

const ARIZONA_LABOR: SettlementGuide = {
  slugs: ['arizona-labor-force-data-breach-class-action-settlement'],
  officialUrl: 'https://azlaborforcesettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was compromised in the January 2023 Arizona Labor Force, Inc., and Labor Systems, Inc., data incident may be affected. The case is Daniel Bozek, et al. v. Arizona Labor Force, Inc., et al., Case No. 2:24-cv-00210-SHD, in the U.S. District Court for the District of Arizona. Arizona Labor Force denies that it did anything wrong. The court has not decided who is right. Read the official notice for the class definition.',
  typicalPayout:
    'The official site says you may be entitled to a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2026-12-28',
  proof: 'optional',
  proofDetail:
    'The only way to receive payment is to submit a valid and timely claim form, online or by mail, by December 28, 2026. Check the official form for what, if anything, to attach. Source: https://azlaborforcesettlement.com/',
  summary:
    'An Arizona Labor Force and Labor Systems settlement over a January 2023 data incident. Claims are due December 28, 2026.',
  description:
    'Daniel Bozek, et al. v. Arizona Labor Force, Inc., et al., Case No. 2:24-cv-00210-SHD, covers a January 2023 data incident. A valid claim form is due December 28, 2026. The official homepage does not state a fixed per-person amount. Opt-out and objection deadlines on the official site are December 13, 2026. The final hearing is January 12, 2027, at 10:00 a.m. The court still has to approve the settlement. Source: https://azlaborforcesettlement.com/',
};

const BLUE_RIDGE_WATER: SettlementGuide = {
  slugs: ['blue-ridge-rural-water-company-data-breach-class-action-settlement'],
  officialUrl: 'https://blueridgedatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was compromised in the July 2024 Blue Ridge Rural Water Company, Inc., data incident may be affected. The official site defines class members as individuals identified by Blue Ridge’s records who are entitled to benefits under the settlement, and says you may have received a previous notice directly from Blue Ridge. The case is Lawrence v. Blue Ridge Rural Water Company, Inc., Case No. 2025-CP-23-03210, in the South Carolina Court of Common Pleas for Greenville County. Blue Ridge denies that it did anything wrong. The court has not decided who is right.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2027-01-14',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by January 14, 2027. Check the official form for what, if anything, to attach. Source: https://blueridgedatasettlement.com/',
  summary:
    'A Blue Ridge Rural Water Company settlement over a July 2024 data incident. Claims are due January 14, 2027.',
  description:
    'Lawrence v. Blue Ridge Rural Water Company, Inc., Case No. 2025-CP-23-03210, covers a July 2024 data incident. A valid claim form is due January 14, 2027. The official homepage does not state a fixed per-person amount. Opt-out and objection deadlines on the official site are January 25, 2027. The final hearing is February 22, 2027. The court still has to approve the settlement. Source: https://blueridgedatasettlement.com/',
};

const PULSZ_YSI: SettlementGuide = {
  slugs: ['pulsz-social-casino-games-class-action-settlement'],
  officialUrl: 'https://www.ysisettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'You are a settlement class member if you spent money to play Pulsz (www.pulsz.com) or Pulszbingo (www.pulszbingo.com) in these states and periods: Alabama, from March 8, 2022, through August 31, 2026; Ohio, New Jersey, or Massachusetts, from February 19, 2024, through August 31, 2026; Tennessee, from November 12, 2022, through August 31, 2026; or Kentucky, from June 29, 2023, through August 31, 2026. The case is Robinson v. YSI, alleging claims under those states’ laws based on the sale of virtual chips in those social casino-style games. Yellow Social (YSI) denies the claims and that it violated any law.',
  typicalPayout:
    'If you do nothing, the official site says you will receive the benefits in virtual currency. You may, but are not required to, submit an election form to receive benefits in a payment or virtual currency, as the official form allows. The official homepage does not state a fixed per-person amount or a total fund size.',
  deadline: '2026-11-30',
  proof: 'no',
  proofDetail:
    'An election form is optional and, if you choose to submit one, is due by the elections deadline of November 30, 2026, online or by mail. The official site does not require a claim form if you do nothing and receive benefits in virtual currency. Exclusion and objection deadlines are also November 30, 2026. Source: https://www.ysisettlement.com/',
  summary:
    'A Yellow Social settlement for people who spent money on Pulsz or Pulszbingo in six states. Elections, exclusions, and objections are due November 30, 2026.',
  description:
    'Robinson v. YSI is a proposed settlement covering people who spent money to play Pulsz or Pulszbingo in Alabama, Ohio, New Jersey, Massachusetts, Tennessee, or Kentucky during the state-specific periods on the official site. YSI denies the claims. If you do nothing, benefits are to be paid in virtual currency. An optional election form, and any exclusion or objection, is due November 30, 2026. The fairness hearing is December 31, 2026, at 10:00 a.m. in the Circuit Court of Franklin County, Russellville, Alabama. The official homepage does not state a fixed per-person amount. The court still has to approve the settlement. Source: https://www.ysisettlement.com/',
  extraFaqs: [
    {
      q: 'Do I have to file a Pulsz settlement election to be paid?',
      a: 'The official site says you may, but are not required to, submit an election form by November 30, 2026. If you do nothing, it says you will receive the benefits in virtual currency and give up rights to sue YSI about the claims in this case. Confirm on https://www.ysisettlement.com/.',
    },
  ],
};

const NCAA_TENNIS: SettlementGuide = {
  slugs: ['ncaa-tennis-prize-money-class-action-settlement'],
  officialUrl: 'https://www.ncaatennisprizemoneyclassaction.com/',
  sourceChecked: '2026-11-25',
  administrator: 'RG/2 Claims Administration LLC',
  eligibilityText:
    'The court certified two classes in Brantmeier v. NCAA. The Injunctive Relief Class includes all persons who, at any time between March 19, 2020 and the date of judgment, competed in NCAA Division I tennis, or were ineligible to compete in NCAA Division I tennis because of the Prize Money Rules. The Damages Class includes all persons who, at any time between March 19, 2020 and November 21, 2025, voluntarily forfeited prize money earned in a tennis tournament, and competed in NCAA Division I tennis or submitted information to the NCAA Eligibility Center. Plaintiffs allege certain NCAA rules restricting student-athletes from accepting prize money in non-NCAA tennis competitions violate federal antitrust laws. The NCAA denies these allegations.',
  typicalPayout:
    'The NCAA has agreed to pay $2 million into a Settlement Fund for the Damages Class and to eliminate certain restrictions on pre-college enrollment student-athletes’ acceptance of prize money. The official site does not state a fixed per-person amount. The NCAA has also agreed to pay Class Counsel $1.875 million in attorneys’ fees and to reimburse $425,000 in expenses, subject to court approval.',
  deadline: '2027-02-08',
  proof: 'yes',
  proofDetail:
    'Damages Class members must submit a claim form by February 8, 2027 (the official site says the court may extend that date). Each claim must contain a valid NCAA ID number and adequate documentation for each tournament where prize money was forfeited. If you do not know your NCAA ID number, RG/2 Claims Administration LLC can provide it. Source: https://www.ncaatennisprizemoneyclassaction.com/',
  summary:
    'A $2 million NCAA tennis prize-money antitrust settlement. Damages Class claims are due February 8, 2027.',
  description:
    'Brantmeier v. NCAA challenges NCAA restrictions on tennis prize money. The NCAA denies the allegations. The Damages Class settlement fund is $2 million. Damages Class claims need a valid NCAA ID and tournament documentation and are due February 8, 2027, unless the court extends the date. The official site listed an exclusion and objection deadline of September 28, 2026. The fairness hearing is January 8, 2027, at 9:30 a.m. RG/2 Claims Administration LLC administers claims. The court still has to approve the settlement. Source: https://www.ncaatennisprizemoneyclassaction.com/',
  extraFaqs: [
    {
      q: 'What do I need to file an NCAA tennis prize-money claim?',
      a: 'The official site says each Damages Class claim must include a valid NCAA ID number and adequate documentation for each tournament where prize money was forfeited. If you do not know your NCAA ID, contact RG/2 Claims Administration LLC at info@rg2claims.com or 1-866-742-4955. Confirm on https://www.ncaatennisprizemoneyclassaction.com/.',
    },
  ],
};

const CAMC_HERNIA: SettlementGuide = {
  slugs: ['camc-hernia-surgery-settlement'],
  officialUrl: 'https://camcbariatricsettlement.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Rust Consulting, Inc.',
  eligibilityText:
    'You may be included if you received a hernia repair procedure while undergoing bariatric surgery from either Dr. Robert B. Shin or Dr. Samuel Rossi at Charleston Area Medical Center facilities between April 5, 2015, and April 4, 2025. The case is L.B. and M.T. v. Robert B. Shin, M.D., and Charleston Area Medical Center, Inc., Civil Action No. 2025-C-541, in the Circuit Court of Kanawha County, West Virginia. Plaintiffs claim the hiatal hernia repairs performed concurrent with bariatric surgery were unnecessary. Defendants deny the allegations and maintain the procedures were medically indicated and within the standard of care.',
  typicalPayout:
    'Defendants have agreed to pay up to $40,000,000. A $30,000,000 Guaranteed Payments Fund is to be distributed evenly among settlement class members who received surgeries performed by Dr. Shin or Dr. Rossi, after court-approved fees, expenses, and any incentive award. Alternatively, class members who suffered certain medical complications related to the hiatal hernia procedure may submit a claim form for a payment from a $10,000,000 Contingent Payments Fund, also after those deductions. The official site does not state a fixed per-person amount for either fund.',
  deadline: '2026-12-14',
  proof: 'optional',
  proofDetail:
    'All class members who do not opt out are eligible for a Guaranteed Fund Payment without additional proof that they were harmed or suffered complications. To seek a Contingent Fund Payment instead, you must file a claim form no later than December 14, 2026, and show that you suffered certain medical complications listed in the official notice. Source: https://camcbariatricsettlement.com/',
  summary:
    'A settlement of up to $40 million over hiatal hernia repairs performed with bariatric surgery at CAMC. Contingent-payment claims are due December 14, 2026.',
  description:
    'L.B. and M.T. v. Robert B. Shin, M.D., and Charleston Area Medical Center, Inc., Civil Action No. 2025-C-541, covers hernia repair procedures performed with bariatric surgery by Dr. Shin or Dr. Rossi at CAMC between April 5, 2015, and April 4, 2025. Defendants deny the claims. The settlement is up to $40,000,000, including a $30,000,000 guaranteed fund paid evenly among class members and a $10,000,000 contingent fund for documented complications. Contingent-payment claims are due December 14, 2026. The official site listed an opt-out and objection deadline of October 13, 2026. The final hearing is December 1, 2026, at 9:00 a.m. Eastern in Charleston, West Virginia. Rust Consulting, Inc. administers the official site. The court still has to approve the settlement. Source: https://camcbariatricsettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need a claim form for the CAMC equal-share payment?',
      a: 'The official site says all class members are eligible to receive a Guaranteed Fund Payment without additional proof of harm or complications. A claim form is required only if you instead seek a Contingent Fund Payment for certain complications, due December 14, 2026. Confirm on https://camcbariatricsettlement.com/.',
    },
  ],
};

const EQUITY_MILL_CREEK: SettlementGuide = {
  slugs: ['equity-residential-1m-mill-creek-apartments-settlement'],
  officialUrl: 'https://www.millcreekapartmentsettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'You are part of this settlement if you signed a lease with the defendants at the Mill Creek Apartments, 440 Dixon Landing Rd, Milpitas, California, and either received or responded to a rent renewal notice between March 4, 2021 and June 22, 2026, or experienced a rent increase that went into effect between March 4, 2021 and May 2, 2023. The lawsuit, brought by Sharon Kachadoorian against Equity Residential Management, L.L.C., Equity Residential, EQR-Fresca 2009 Limited Partnership, and an on-site landlord, claims the defendants did not follow the Milpitas Rent Ordinance when proposing and increasing rent.',
  typicalPayout:
    'Equity has agreed to pay $1,000,000.00 into a settlement fund for payments to settlement class members and for court-approved attorneys’ fees and costs, a $15,000.00 service award to the plaintiff, and administration costs. If money is left over after claims and expenses are paid, it will be donated to the California State Bar’s Greg E. Knoll Justice Gap Fund. The official site does not state a fixed per-person amount. Equity has also agreed to change rent-increase notices issued under the Milpitas Rent Review Ordinance so they include the reason or reasons for the increase, in the same language or languages as the rest of the notice.',
  deadline: '2026-12-14',
  proof: 'no',
  proofDetail:
    'The official site says you will receive a settlement payment paid to the PayPal account associated with your email address. You can elect Venmo or a paper check instead by filling out the official payment-election form. Opt out or object by December 14, 2026, if you do not want to stay in the settlement. The official site does not require a claim form for the payment. Source: https://www.millcreekapartmentsettlement.com/',
  summary:
    'A $1,000,000 Equity Residential settlement for Mill Creek Apartments tenants in Milpitas, California. Opt out or object by December 14, 2026.',
  description:
    'Sharon Kachadoorian’s lawsuit against Equity Residential entities covers Mill Creek Apartments leases at 440 Dixon Landing Rd, Milpitas, California, with qualifying rent-renewal notices or rent increases in the periods on the official site. Equity has agreed to pay $1,000,000.00. The official site says payments go to the PayPal account on file unless you elect Venmo or a check. Opt out or object by December 14, 2026. The court still has to approve the settlement. Source: https://www.millcreekapartmentsettlement.com/',
};

const FRONTIER_401K: SettlementGuide = {
  slugs: ['frontier-communications-14m-401-k-class-action-settlement'],
  officialUrl: 'https://frontiererisasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'The settlement class includes all vested participants in or beneficiaries of the Plan, and any alternate payee of a person subject to a QDRO who participated in the Plan, at any time during the Class Period, whose Plan accounts included investments in Verizon common stock (including the Verizon Stock Fund). Defendants, their immediate families, and legal representatives, successors, and assigns of excluded persons are excluded. The official notice has the Class Period dates. The lawsuit concerns whether the Plan became overly concentrated in Verizon stock. ERISA is the federal law that regulates most private retirement plans.',
  typicalPayout:
    'The settlement provides a $14,050,000.00 Qualified Settlement Fund, allocated to eligible class members after any court-approved deductions for attorneys’ fees and costs, case contribution awards, and administrative expenses. The official site does not state a fixed per-person amount. You do not need to do anything to be eligible for your share if the settlement is approved. If you no longer have a Plan account, a check will be mailed unless you submit a rollover form.',
  deadline: '2026-12-08',
  proof: 'no',
  proofDetail:
    'You do not need to submit a claim form to receive your share if the settlement is approved. To receive a direct rollover to an IRA or qualified employer plan, submit a Rollover Form on or before December 8, 2026, using the Claimant ID and Access Code on the postcard notice. Objections are also due December 8, 2026. Source: https://frontiererisasettlement.com/',
  summary:
    'A $14,050,000 Frontier Communications 401(k) settlement over Verizon stock in the plan. Rollover forms and objections are due December 8, 2026.',
  description:
    'This ERISA settlement covers vested participants and beneficiaries whose Plan accounts included Verizon common stock during the Class Period stated in the official notice. The Qualified Settlement Fund is $14,050,000.00. Payment is automatic if the court approves; a rollover form is optional and due December 8, 2026. The fairness hearing is January 7, 2027, at 10:00 a.m. at 450 Main Street, Hartford, Connecticut. The court still has to approve the settlement. Source: https://frontiererisasettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need a claim form for the Frontier 401(k) settlement?',
      a: 'The official site says you do not need to do anything to be part of the class or, if the settlement is approved, to be eligible for your share. Submit a Rollover Form by December 8, 2026, only if you want a direct rollover instead of a check. Confirm on https://frontiererisasettlement.com/.',
    },
  ],
};

const KUCOIN_NY: SettlementGuide = {
  slugs: ['kucoin-22m-new-york-enforcement-action-settlement'],
  officialUrl: 'https://www.kucoinnyagconsentorder.com/',
  sourceChecked: '2026-11-25',
  administrator: 'Simpluris',
  eligibilityText:
    'New York customers who bought or sold cryptocurrency on the KuCoin trading platform, as defined by the consent order, may submit a claim to recover assets previously held in their KuCoin account. The website was created pursuant to a court order in a New York Attorney General action filed March 9, 2023. Read the official site and the Stipulation and Consent for the definition of an eligible New York Customer.',
  typicalPayout:
    'KuCoin attested that as of November 29, 2023, New York customers held assets with an approximate notional value of $16,766,642.00 in fiat and/or cryptocurrencies at KuCoin, an amount subject to market fluctuation. KuCoin agreed to return current account balances in its possession and control in about that amount, and to pay $5.3 million to the New York Attorney General according to the consent order and judgment. A claim seeks return of your own account assets, not a flat per-person award.',
  deadline: '2029-02-28',
  proof: 'yes',
  proofDetail:
    'Submit a completed claim form online by 11:59 p.m. EST on February 28, 2029, or mail it postmarked (or, if not sent by U.S. Mail, received) by that date. The official site says the form requires information to substantiate the claim, including connecting the KuCoin depositing wallet or other required documentation. Source: https://www.kucoinnyagconsentorder.com/',
  summary:
    'A New York Attorney General consent order for KuCoin customers to recover account assets. Claims are due February 28, 2029.',
  description:
    'Under a New York Attorney General consent order, eligible New York KuCoin customers may submit a claim to recover assets previously held in their accounts. KuCoin attested that New York customer balances were about $16,766,642.00 as of November 29, 2023, and agreed to return current balances in its possession and to pay $5.3 million to the OAG. Claims, with required wallet or other documentation, are due by 11:59 p.m. EST on February 28, 2029. Simpluris is the claims administrator. Source: https://www.kucoinnyagconsentorder.com/',
  extraFaqs: [
    {
      q: 'Is the KuCoin New York claim a flat cash payment?',
      a: 'The official site describes a process to recover assets previously held in a KuCoin account, not a fixed per-person cash award. KuCoin attested to an approximate $16,766,642.00 notional value of New York customer assets as of November 29, 2023, subject to market fluctuation. Confirm on https://www.kucoinnyagconsentorder.com/.',
    },
  ],
};

const TEXAS_RETINA: SettlementGuide = {
  slugs: ['texas-retina-data-breach-settlement'],
  officialUrl: 'https://www.txretinadatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'The settlement arises from Covey, et al. v. Texas Retina Associates, et al., No. DC-24-09642, in the District Court of Dallas County, Texas, 101st Judicial District. On or about March 27, 2024, the private information of certain individuals was potentially accessible to an unauthorized third party who gained access to Texas Retina Associates systems. Read the official notice for the class definition.',
  typicalPayout:
    'A valid claim may seek documented out-of-pocket expenses not to exceed $4,000 per settlement class member, incurred as a result of the data incident, including unreimbursed bank fees, long-distance phone charges, cell phone charges billed by the minute, data charges billed by usage, postage, gasoline for local travel, and fees for credit reports, credit monitoring, or other identity-theft insurance products purchased between March 27, 2024 and November 30, 2026. In lieu of documented-loss claims, class members may claim a $45.00 cash payment without documenting losses. Class members may also elect three years of identity-theft protection, including one-bureau credit monitoring and $1,000,000 in identity-theft protection insurance, with no supporting documentation required for that benefit.',
  deadline: '2026-11-30',
  proof: 'optional',
  proofDetail:
    'Complete and file a claim form online or by mail postmarked by November 30, 2026. Expense-reimbursement claims need the supporting documentation listed on the official site. The $45.00 cash payment and the identity-theft protection election do not require loss documentation. Source: https://www.txretinadatasettlement.com/',
  summary:
    'A Texas Retina Associates settlement over a March 27, 2024 data incident. Claims are due November 30, 2026.',
  description:
    'Covey, et al. v. Texas Retina Associates, et al., No. DC-24-09642, covers a March 27, 2024 data incident. Valid claims may seek documented expenses up to $4,000, or a $45.00 cash payment instead, and may elect three years of identity-theft protection with $1,000,000 in insurance. Claims are due November 30, 2026. The final fairness hearing is December 3, 2026, at 10:30 a.m. in Dallas, Texas, and may also be held by Zoom. The court still has to approve the settlement. Source: https://www.txretinadatasettlement.com/',
};

const WAYNE_MEMORIAL: SettlementGuide = {
  slugs: ['wayne-memorial-hospital-data-breach-class-action-settlement'],
  officialUrl: 'https://www.wmhdatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was potentially involved in a data incident discovered on or around June 3, 2024, involving Wayne Memorial Hospital may be affected. The case is Bates v. Wayne Memorial Hospital, Case No. SUCV2025000239, in the Superior Court of Wayne County, State of Georgia. Read the official notice for the class definition.',
  typicalPayout:
    'All settlement class members may file a claim for Cash Payment A (documented losses) and Cash Payment B (alternate cash). All settlement class members will automatically be entitled to enroll in credit monitoring. If you do nothing, the official site says you will receive a credit-monitoring enrollment code but will not receive a cash payment. The official homepage does not state the cash amounts.',
  deadline: '2026-12-07',
  proof: 'optional',
  proofDetail:
    'A claim form must be submitted by December 7, 2026, to receive a cash payment. Check the official form for what, if anything, to attach for documented-loss claims. You do not need a cash claim to receive a credit-monitoring enrollment code. Source: https://www.wmhdatasettlement.com/',
  summary:
    'A Wayne Memorial Hospital settlement over a data incident discovered around June 3, 2024. Cash claims are due December 7, 2026.',
  description:
    'Bates v. Wayne Memorial Hospital, Case No. SUCV2025000239, covers a data incident discovered on or around June 3, 2024. Class members may claim documented-loss and alternate-cash payments by December 7, 2026, and are entitled to enroll in credit monitoring without a cash claim. The official homepage does not state the cash amounts. The official site listed an exclusion deadline of November 7, 2026. The court still has to approve the settlement. Source: https://www.wmhdatasettlement.com/',
  extraFaqs: [
    {
      q: 'Do I need a claim form for Wayne Memorial Hospital credit monitoring?',
      a: 'The official site says all settlement class members will automatically be entitled to enroll in credit monitoring. A claim form submitted by December 7, 2026, is required for a cash payment. Confirm on https://www.wmhdatasettlement.com/.',
    },
  ],
};

const VIDA_Y_SALUD: SettlementGuide = {
  slugs: ['vida-y-salud-health-systems-data-breach-class-action-settlement'],
  officialUrl: 'https://vsidatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was potentially impacted in the October 2025 Vida Y Salud-Health Systems, Inc. data incident may be affected. The official site says certain files that contained private information were accessed, and that those files may have contained personal information such as name, Social Security number, claims information, and diagnoses. Class members are defined as individuals identified by VSHSI’s records who are entitled to benefits under the settlement, and you may have received a previous notice directly from VSHSI. The case is Murray, et al. v. Vida Y Salud-Health Systems, Inc., Case No. 26-01-15726-ZCV, in the 293rd District Court for Zavala County, Texas. VSHSI denies that it did anything wrong. The court has not decided who is right.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2027-01-18',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by January 18, 2027. Check the official form for what, if anything, to attach. Source: https://vsidatasettlement.com/',
  summary:
    'A Vida Y Salud-Health Systems settlement over an October 2025 data incident. Claims are due January 18, 2027.',
  description:
    'Murray, et al. v. Vida Y Salud-Health Systems, Inc., Case No. 26-01-15726-ZCV, covers an October 2025 data incident. A valid claim form is due January 18, 2027. The official homepage does not state a fixed per-person amount. Objection and opt-out deadlines on the official site are January 4, 2027. The final hearing is February 2, 2027, at 9:00 a.m. The court still has to approve the settlement. Source: https://vsidatasettlement.com/',
};

const JACKSON_COUNTY_TAX: SettlementGuide = {
  slugs: ['jackson-county-missouri-property-tax-reassessment-settlement'],
  officialUrl: 'https://www.jacksoncountypropertytaxclassaction.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'The settlement concerns the 2023 reassessment of residential property in Jackson County, Missouri, in a class certified on April 2, 2026. The case, Case No. 2416-CV25478, claims that increases of more than 15% in the 2023 reassessment, excluding new construction or improvements, were unlawful because the County did not perform the physical inspections and provide the notices Missouri law required. If you still own the over-assessed property, or you are a former owner, you may be affected. Read the official notice for the class definition. The Counterclaim Defendants assert legal and procedural defenses.',
  typicalPayout:
    'If you still own the property that was over-assessed, you automatically receive a tax credit equal to the amount you overpaid for 2023 and 2024: the difference between the taxes you actually paid and the taxes you would have paid at the same tax rates if the increase had been capped at 15%. The credit is applied to your property tax bills in three equal installments over the 2026, 2027, and 2028 tax years. If you no longer own the property, you can receive that overpayment in cash, paid over the same three annual periods, by submitting a claim form. A $6,000,000 Special Circumstances Fund reimburses documented out-of-pocket appraisal fees and legal fees incurred to challenge or respond to the reassessment, with no cap on an individual claim; if approved claims exceed the fund, payments are reduced proportionately.',
  deadline: '2026-12-03',
  proof: 'optional',
  proofDetail:
    'Current owners who still own the taxed property receive the tax credit automatically and do not need a claim form for that credit. A claim form is required by December 3, 2026, if you no longer own the property or if you seek reimbursement from the Special Circumstances Fund. Special Circumstances Fund claims need documentation of appraisal or legal fees. Source: https://www.jacksoncountypropertytaxclassaction.com/',
  summary:
    'A Jackson County, Missouri, settlement over the 2023 residential reassessment. Former-owner and special-circumstances claims are due December 3, 2026.',
  description:
    'Case No. 2416-CV25478 covers the 2023 Jackson County residential reassessment and increases of more than 15%, excluding new construction or improvements. Current owners receive an automatic tax credit for 2023 and 2024 overpayments, applied in three installments over tax years 2026, 2027, and 2028. Former owners may claim the same amount in cash, and anyone may claim documented appraisal or legal fees from a $6,000,000 fund, by December 3, 2026. The official site listed an exclusion and objection deadline of November 18, 2026. The court still has to approve the settlement. Source: https://www.jacksoncountypropertytaxclassaction.com/',
  extraFaqs: [
    {
      q: 'Do current Jackson County owners need a claim form?',
      a: 'The official site says that if you still own the over-assessed property, you automatically receive your tax credit and will be bound by the settlement. A claim form due December 3, 2026, is required only if you no longer own the property or you seek reimbursement from the Special Circumstances Fund. Confirm on https://www.jacksoncountypropertytaxclassaction.com/.',
    },
  ],
};

const MCLEAN_MORTGAGE: SettlementGuide = {
  slugs: ['mclean-mortgage-corporation-data-breach-class-action-settlement'],
  officialUrl: 'https://mcleandatasettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'People whose private information was compromised in the October 2024 McLean Mortgage Corporation data breach may be affected. The official site says a targeted cyberattack on McLean’s computer systems in October 2024 potentially accessed certain files that contained private information. The case is In re McLean Data Breach Litigation, Case No. 3:25-cv-00461, in the U.S. District Court for the Eastern District of Virginia. McLean denies that it did anything wrong. The court has not decided who is right. Read the official notice for the class definition.',
  typicalPayout:
    'The official site says you may be entitled to benefits and a cash payment if you submit a valid and timely claim form. The homepage does not state a fixed per-person amount. Check the official notice for the payment rules.',
  deadline: '2026-12-10',
  proof: 'optional',
  proofDetail:
    'The only way to receive benefits or payments is to submit a valid and timely claim form, online or by mail, by December 10, 2026. Check the official form for what, if anything, to attach. Source: https://mcleandatasettlement.com/',
  summary:
    'A McLean Mortgage Corporation settlement over an October 2024 data incident. Claims are due December 10, 2026.',
  description:
    'In re McLean Data Breach Litigation, Case No. 3:25-cv-00461, covers an October 2024 cyberattack on McLean Mortgage Corporation’s systems. A valid claim form is due December 10, 2026. The official homepage does not state a fixed per-person amount. The official site listed opt-out and objection deadlines of November 10, 2026, and a final hearing on December 10, 2026, at 11:00 a.m. The court still has to approve the settlement. Source: https://mcleandatasettlement.com/',
};

const BECTON_FAIR_FUND: SettlementGuide = {
  slugs: ['becton-dickinson-175m-sec-fair-fund-bdx'],
  officialUrl: 'https://www.bectonfairfund.com/',
  sourceChecked: '2026-11-25',
  administrator: 'JND Legal Administration',
  eligibilityText:
    'You may be eligible if you purchased or acquired Becton, Dickinson and Company common stock from February 5, 2019, through February 5, 2020, inclusive, and suffered losses, and you are not an excluded party. This is an SEC Fair Fund, In the Matter of Becton, Dickinson and Company, File No. 3-22361, not a private class-action damages settlement. The Commission found that the company made repeated misrepresentations to investors regarding risks in selling its Alaris infusion pump. Read the official site for who is excluded and how losses are calculated.',
  typicalPayout:
    'The Commission ordered a $175,000,000.00 civil money penalty and established a Fair Fund so the penalty could be distributed to harmed investors. The Fair Fund consists of that $175,000,000.00, held in a Commission-designated account at the U.S. Department of the Treasury. A distribution payment depends on your claimed transactions and the official plan of allocation. The official site does not state a fixed per-person amount.',
  deadline: '2026-12-13',
  proof: 'yes',
  proofDetail:
    'Submit a completed, signed claim form and adequate supporting documentation for claimed transactions online no later than 11:59 p.m. EST on December 13, 2026, or mail it postmarked by that date (or, if not sent by First Class Mail, received by the fund administrator by December 13, 2026). Source: https://www.bectonfairfund.com/',
  summary:
    'A $175 million SEC Fair Fund for certain Becton, Dickinson and Company common-stock purchasers. Claims are due December 13, 2026.',
  description:
    'In the Matter of Becton, Dickinson and Company, File No. 3-22361, the SEC established a $175,000,000.00 Fair Fund from a civil money penalty. People who purchased or acquired BD common stock from February 5, 2019, through February 5, 2020, inclusive, and suffered losses may submit a claim with supporting transaction documents by 11:59 p.m. EST on December 13, 2026. JND Legal Administration is the fund administrator. Source: https://www.bectonfairfund.com/',
  extraFaqs: [
    {
      q: 'Is the Becton Dickinson Fair Fund a class-action settlement?',
      a: 'The official site describes an SEC Fair Fund created so a $175,000,000.00 civil money penalty can be distributed to harmed investors. It is not described there as a private class-action settlement. Eligibility and claim rules are on https://www.bectonfairfund.com/.',
    },
  ],
};

const GUADALUPE_CREDIT_UNION: SettlementGuide = {
  slugs: ['guadalupe-credit-union-new-mexico-class-action-settlement'],
  officialUrl: 'https://www.salasvgcusettlement.com/',
  sourceChecked: '2026-11-25',
  eligibilityText:
    'The proposed settlement covers all persons against whom Guadalupe Credit Union filed a collections lawsuit in Santa Fe County Magistrate Court without being represented by a New Mexico licensed attorney in the collection action. The case is Kyle Salas v. Guadalupe Credit Union, No. D-101-CV-2019-02660, in the First Judicial District Court, Santa Fe County, New Mexico. Guadalupe Credit Union has not admitted it did anything wrong.',
  typicalPayout:
    'The settlement requires Guadalupe Credit Union to pay each class member the amount paid to Guadalupe Credit Union after the filing of the collections lawsuit, plus $1,000. If the lawsuit was filed against more than one person, payment will be made jointly unless acceptable arrangements are otherwise made. Plaintiffs will ask the court to award each of them $5,000. The settlement also provides $20,000 for administration costs, and attorney fees approved by the court, paid separately from the money paid to class members. Guadalupe Credit Union also agreed to no longer file lawsuits without being represented by an attorney.',
  deadline: '2026-11-30',
  proof: 'no',
  proofDetail:
    'The official site says that if you do nothing, you will be bound by the settlement if the court approves it. A claim form is not listed as required to be paid. To exclude yourself or object, your request or objection must be postmarked no later than November 30, 2026. The hearing is February 3, 2027, at 10:00 a.m. Source: https://www.salasvgcusettlement.com/',
  summary:
    'A Guadalupe Credit Union settlement over collection lawsuits filed in Santa Fe County Magistrate Court. Exclusions and objections are due November 30, 2026.',
  description:
    'Kyle Salas v. Guadalupe Credit Union, No. D-101-CV-2019-02660, covers people sued in Santa Fe County Magistrate Court collection actions in which Guadalupe Credit Union was not represented by a New Mexico licensed attorney. The credit union has not admitted wrongdoing. Each class member is to be paid the amount paid to the credit union after the lawsuit was filed, plus $1,000. The official site does not require a claim form if you do nothing. Exclusions and objections are due November 30, 2026. The hearing is February 3, 2027, at 10:00 a.m. The court still has to approve the settlement. Source: https://www.salasvgcusettlement.com/',
  extraFaqs: [
    {
      q: 'Do I have to file a Guadalupe Credit Union claim to be paid?',
      a: 'The official site lists Do Nothing, object, or exclude yourself. It does not list a claim form as required to receive payment. Confirm on https://www.salasvgcusettlement.com/ before you act.',
    },
  ],
};

export const NOV25_SETTLEMENT_GUIDES: SettlementGuide[] = [
  ADAPT_HEALTH,
  ECSI_BREACH,
  EFI_BREACH,
  HOLT_GROUP,
  PILLSBURY_BREACH,
  USC_ARCADIA,
  RIVERSIDE_CASINO,
  BENWORTH_CAPITAL,
  ARIZONA_LABOR,
  BLUE_RIDGE_WATER,
  PULSZ_YSI,
  NCAA_TENNIS,
  CAMC_HERNIA,
  EQUITY_MILL_CREEK,
  FRONTIER_401K,
  KUCOIN_NY,
  TEXAS_RETINA,
  WAYNE_MEMORIAL,
  VIDA_Y_SALUD,
  JACKSON_COUNTY_TAX,
  MCLEAN_MORTGAGE,
  BECTON_FAIR_FUND,
  GUADALUPE_CREDIT_UNION,
];
