import { defineCopy } from './types';

/**
 * Copy for the shared components in src/features/shared, the deadline
 * reminders and the data layer. Text cut around a link or a value is kept as
 * fragments that each appear verbatim in the web source; the component joins
 * them with single spaces.
 */
export const shared = defineCopy({
  // StatePickerField (Settings, onboarding and the claim's copy-ready details) ---
  searchStates: {
    text: 'Search states',
    source: 'plan 3.3 (Settings: state picker)',
    mobileOnly: true,
  },
  noMatchingStates: {
    text: 'No state matches that search.',
    source: 'plan 3.3 (Settings: state picker)',
    mobileOnly: true,
  },

  // SettlementBadges -------------------------------------------------------
  openForClaims: {
    text: 'Open for claims',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  claimsClosed: {
    text: 'Claims closed',
    source: 'src/components/LawsuitCard.tsx',
  },

  // UnverifiedLine (the settlement card) -------------------------------------
  unverifiedLineLabel: {
    text: 'Unverified: check the official site.',
    source: 'src/components/LawsuitCard.tsx',
  },
  noLinkYet: {
    text: 'We don’t have its link yet.',
    source: 'src/components/LawsuitCard.tsx',
  },
  /** Screen-reader name of the card's link: "{label} for {title}" (the web's sr-only " for {title}"). */
  linkForTitle: {
    text: '{label} for {title}',
    source: 'src/components/LawsuitCard.tsx',
    mobileOnly: true,
  },

  // Settlement page, after an official-notice guide hides the unverified banner
  checkedAgainstNotice: {
    text: 'Checked against the official notice on {date}',
    source: 'src/lib/settlement-guides.ts',
  },

  // UnverifiedNotice, settlement variant -------------------------------------
  unverifiedOpenBody: {
    text: 'We haven’t checked this listing against the official settlement notice yet. Before you file, confirm the deadline, who qualifies and what proof you need on the official site.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  unverifiedClosedBody: {
    text: 'We haven’t checked this listing against the official settlement notice. The official site has the latest status.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  noOfficialLink: {
    text: 'We don’t have a link to the official site yet. Search for the settlement’s official website, and only use a site the settlement notice names.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  /** Followed by " ({host})". */
  goToOfficialSite: {
    text: 'Go to the official site',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  sourceLinkIntro: {
    text: 'We don’t have the official site’s link yet. This is where we found the listing:',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  /** The source link reads "{label} ({host}, not the official site)". */
  notTheOfficialSite: {
    text: 'not the official site',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // DeadlineText (the claim flow's StatusPanel) ------------------------------
  noDeadlineListed: {
    text: 'We don’t have a deadline listed. Check the official notice.',
    source: 'src/components/claims/ClaimFlow.tsx',
  },

  // Disclaimers -------------------------------------------------------------
  legalDisclaimerTitle: {
    text: 'Legal disclaimer',
    source: 'src/components/Disclaimer.tsx',
  },
  showAll: {
    text: 'Show all',
    source: 'plan 3.3 (Claim footer: compact LEGAL_DISCLAIMER with "Show all")',
    mobileOnly: true,
  },

  // SettleSignalCredit, catalog variant (src/app/lawsuits/page.tsx) ----------
  creditListLead: {
    text: 'Listings from SettleSignal are adapted from',
    source: 'src/app/lawsuits/page.tsx',
  },
  creditListSite: {
    text: 'SettleSignal (settlesignal.com)',
    source: 'src/app/lawsuits/page.tsx',
  },
  creditListUnder: {
    text: 'under',
    source: 'src/app/lawsuits/page.tsx',
  },
  creditListLicense: {
    text: 'CC BY 4.0',
    source: 'src/app/lawsuits/page.tsx',
  },
  creditListTail: {
    text: '. Lawsuit AI may have shortened or reformatted them.',
    source: 'src/app/lawsuits/page.tsx',
  },

  // SettleSignalCredit, footer variant (src/components/Footer.tsx) ----------
  creditFooterLead: {
    text: 'Settlement listings include data from',
    source: 'src/components/Footer.tsx',
  },
  creditFooterSite: {
    text: 'SettleSignal',
    source: 'src/components/Footer.tsx',
  },
  creditFooterUsedUnder: {
    text: ', used under the',
    source: 'src/components/Footer.tsx',
  },
  creditFooterLicense: {
    text: 'CC BY 4.0 license',
    source: 'src/components/Footer.tsx',
  },
  creditFooterTail: {
    text: '. We reformat it, and we have not verified each listing. Always check the official settlement website.',
    source: 'src/components/Footer.tsx',
  },

  // SignedOutPrompt (src/app/login/page.tsx) ---------------------------------
  welcomeBack: {
    text: 'Welcome back',
    source: 'src/app/login/page.tsx',
  },
  logInToSeeClaims: {
    text: 'Log in to see and update the claims you are tracking.',
    source: 'src/app/login/page.tsx',
  },
  /** Also the signed-out prompt's title outside a claim, unless a session just ended. */
  claimLoginTitle: {
    text: 'Log in or create a free account',
    source: 'src/app/login/page.tsx',
  },
  claimLoginBody: {
    text: 'You need a free account to keep track of this claim. You still file on the official site yourself.',
    source: 'src/app/login/page.tsx',
  },
  newToClaimMatch: {
    text: 'New to Lawsuit AI?',
    source: 'src/app/login/page.tsx',
  },
  createFreeAccount: {
    text: 'Create a free account',
    source: 'src/app/login/page.tsx',
  },

  // Deadline reminders (local notifications) --------------------------------
  reminderBody: {
    text: '{title}. Deadline {date}. If you qualify, file on the official site, then tell us in Lawsuit AI.',
    source: 'plan 5 (Deadline reminders)',
    mobileOnly: true,
  },
  reminderChannelName: {
    text: 'Deadline reminders',
    source: 'plan 3.3 (Settings: "Deadline reminders" toggle)',
    mobileOnly: true,
  },

  // Data layer --------------------------------------------------------------
  typeDeleteToConfirm: {
    text: 'Type DELETE to confirm.',
    source: 'src/components/DeleteAccount.tsx',
  },
});

/** Fills "{name}" placeholders in a copy template. */
export function fillCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
