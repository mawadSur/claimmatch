import { defineCopy } from './types';

/**
 * DRAFT — for counsel review, not in effect. Do not paste into App Store
 * Connect or the Play Console until docs/legal/signoff-checklist.md row 15
 * is signed off. Store listing text for the App Store and Google Play (plan
 * 5). It lives here so the copy guards and the parity checks read it before
 * it is pasted; the app never shows it. Wording is taken from live
 * lawsuitai.org/llms.txt, /terms §14 and /privacy (verified 2026-11-25), plus
 * SITE in src/lib/utils.ts. Never reuse the root package.json description
 * ("you're eligible for"), which the guards ban. No dollar figures, no 15%
 * fee, no general promise of on-behalf filing.
 */
export const store = defineCopy({
  /** Both stores' app name (30 characters at most). */
  name: { text: 'Lawsuit AI', source: 'src/lib/utils.ts' },
  /** App Store subtitle (30 characters at most). */
  subtitle: { text: 'Free claim assistant', source: 'src/lib/utils.ts' },
  /** Google Play short description (80 characters at most). */
  shortDescription: { text: 'Free claim assistant for class-action settlements', source: 'src/lib/utils.ts' },
  /** First paragraph of the full description on both stores (llms.txt tagline). */
  descriptionLead: {
    text: 'Find open class-action settlements, check who qualifies on the official notice, file on the official site, and keep track of your claims. Free.',
    source: 'src/lib/utils.ts',
  },
  /** MAY_FILE_SHORT_SENTENCE — live /llms.txt and shortDisclaimer(true). */
  mayFile: {
    text: 'Where you choose one-click filing and sign the claim, Lawsuit AI files the claim for you; otherwise you file every claim yourself on the official settlement website.',
    source: 'src/lib/copy.ts',
  },
  /** OFFICIAL_FILING_IS_FREE. */
  officialFilingFree: {
    text: 'Filing on the official site is always free.',
    source: 'src/lib/copy.ts',
  },
  /** BETA_FEE_COPY. */
  betaFee: {
    text: 'Lawsuit AI is free during beta. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.',
    source: 'src/lib/copy.ts',
  },
  /** SOME_SETTLEMENTS. */
  someSettlements: {
    text: 'For some settlements, Lawsuit AI files the claim for you after you review and sign it.',
    source: 'src/lib/copy.ts',
  },
  alwaysFileYourself: {
    text: 'You can always file on the official site yourself instead, where filing is free.',
    source: 'src/lib/copy.ts',
  },
  notLawFirm: {
    text: 'Lawsuit AI is a free claim assistant, not a law firm, and does not give legal advice.',
    source: 'src/lib/disclaimer.ts',
  },
  noAttorneyClient: {
    text: 'Using this app does not create an attorney-client relationship.',
    source: 'src/lib/disclaimer.ts',
  },
  neverHandlesPayments: {
    text: 'Lawsuit AI never receives or handles settlement payments.',
    source: 'src/lib/copy.ts',
  },
  administratorPaysYou: {
    text: 'Any payment comes to you from the settlement administrator, never through Lawsuit AI.',
    source: 'src/lib/copy.ts',
  },
  unverifiedCaution: {
    text: 'Our listings come from SettleSignal, a public data source. We haven’t checked each one yet, so we label them “Unverified” and point you to the official site.',
    source: 'mobile/store.config.json',
    mobileOnly: true,
  },
  officialNoticeFinal: {
    text: 'The official settlement notice and website are the final word on deadlines, who qualifies and payments, so check them before you act.',
    source: 'src/lib/disclaimer.ts',
  },
  noLegalAdviceQualify: {
    text: 'We don’t give legal advice and can’t tell you whether you qualify. The official notice decides who qualifies.',
    source: 'mobile/store.config.json',
    mobileOnly: true,
  },
  weDontSell: {
    text: 'We use your information to run your account and keep track of your claims. We don’t sell it.',
    source: 'mobile/store.config.json',
    mobileOnly: true,
  },
  settleSignalLlms: {
    text: 'Listings are unverified — check the official notice before you file.',
    source: 'src/lib/llms-txt.ts',
  },
  settleSignalSource: {
    text: 'Settlement catalog data includes [SettleSignal](https://settlesignal.com/data/), CC BY 4.0.',
    source: 'src/lib/llms-txt.ts',
  },
});

/** THE FACTS bullets for both stores (joined with newlines). */
export function storeFactsText(): string {
  return [
    `• ${store.mayFile.text}`,
    `• ${store.officialFilingFree.text} ${store.betaFee.text}`,
    `• ${store.administratorPaysYou.text}`,
    `• ${store.unverifiedCaution.text}`,
    `• ${store.noLegalAdviceQualify.text}`,
    `• ${store.notLawFirm.text} ${store.noAttorneyClient.text} ${store.neverHandlesPayments.text} ${store.officialNoticeFinal.text}`,
    `• ${store.weDontSell.text}`,
  ].join('\n');
}

/**
 * Full App Store / Play long description. Counsel must sign off (row 15)
 * before this is pasted into a console. Keep under 4,000 characters.
 */
export function storeDescriptionText(): string {
  return [
    store.descriptionLead.text,
    '',
    store.mayFile.text,
    '',
    store.officialFilingFree.text,
    store.betaFee.text,
    '',
    'FIND AN OPEN SETTLEMENT',
    'Browse settlements that are taking claims right now. Every listing shows the payout and the deadline as the source states them.',
    '',
    'CHECK WHO QUALIFIES',
    'Each settlement page sums up who qualifies, the payout, the deadline and whether you need proof, then links to the official notice so you can confirm it yourself.',
    '',
    'FILE A CLAIM',
    `${store.someSettlements.text} ${store.alwaysFileYourself.text} ${store.officialFilingFree.text}`,
    '',
    'KEEP TRACK OF EVERY CLAIM',
    'Tell us when you have filed and save the confirmation number the official site gives you. Your claims and deadlines stay in one list.',
    '• Confirmation numbers in one place',
    '• Claims grouped by what to do next',
    '',
    'DEADLINE REMINDERS',
    'A reminder on this device 7 days and 1 day before each deadline, for claims you haven’t told us you filed.',
    '',
    'THE FACTS',
    storeFactsText(),
  ].join('\n');
}
