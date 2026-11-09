import { defineCopy } from './types';

/**
 * Settlement detail, /lawsuits/{slug} (plan 3.3 "Settlement detail"): the
 * page (src/app/lawsuits/[slug]/page.tsx), "The short answer"
 * (src/components/settlement/AnswerBlock.tsx), the FAQ
 * (src/components/settlement/SettlementFaq.tsx) and the not-found page
 * (src/app/lawsuits/[slug]/not-found.tsx). Text cut around a value or a link
 * is kept as fragments that each appear verbatim in the web source.
 */
export const settlement = defineCopy({
  /** Header title: the page's title when its lookup fails (generateMetadata). */
  screenTitle: {
    text: 'Settlement',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // "The short answer" (AnswerBlock) ------------------------------------------
  shortAnswerTitle: {
    text: 'The short answer',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  shortAnswerNote: {
    text: 'From our listing. Confirm every detail on the official notice before you file.',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  factWhoQualifies: {
    text: 'Who qualifies',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  factListedPayout: {
    text: 'Listed payout',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  factClaimDeadline: {
    text: 'Claim deadline',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  factProofNeeded: {
    text: 'Proof needed',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  factAdministrator: {
    text: 'Administrator',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  /** Also the sidebar's heading and button. */
  checkIfYouQualify: {
    text: 'Check if you qualify',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  /** Followed by " ({host})". */
  officialClaimSite: {
    text: 'Official claim site',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },
  /** Followed by "." without a link, or by the link (host or label). */
  missingDetails: {
    text: 'We don’t have these details yet: {list}. Check the official notice',
    source: 'src/components/settlement/AnswerBlock.tsx',
  },

  // Header call to action ------------------------------------------------------
  startYourClaim: {
    text: 'Start your claim',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  freeYouFileYourself: {
    text: 'Free. You file on the official site yourself.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // Deadline and proof facts -------------------------------------------------
  deadline: {
    text: 'Deadline',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  deadlinePassed: {
    text: 'This deadline has passed.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  notTakingClaims: {
    text: 'Not taking claims.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  deadlineCutoff: {
    text: 'Deadlines often end at 11:59 pm in the settlement’s time zone. Check the official site for the exact cutoff.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  proof: {
    text: 'Proof',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  notStated: {
    text: 'Not stated',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // About and who may qualify ------------------------------------------------
  aboutTitle: {
    text: 'About this settlement',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  whoMayQualify: {
    text: 'Who may qualify',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  whatOurListingSays: {
    text: 'What our listing says:',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  shortSummaryNote: {
    text: 'This is a short summary, not the official rules. The official notice has the exact rules.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  noEligibilityRules: {
    text: 'We don’t have the rules for who qualifies. Read the official notice before you file.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  readRulesOnOfficialSite: {
    text: 'Read the rules on the official site',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // How filing works ---------------------------------------------------------
  howFilingWorks: {
    text: 'How filing works',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepQualifyTitle: {
    text: 'Check that you qualify',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepQualifyBody: {
    text: 'Read the official notice. It has the exact rules and the deadline.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepFileTitle: {
    text: 'File on the official site yourself',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepFileBody: {
    text: 'Filing is free. ClaimMatch never files for you and never handles settlement payments.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepTrackTitle: {
    text: 'Keep track in ClaimMatch',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepTrackBody: {
    text: 'Tell us when you’ve filed and save the confirmation number the official site gives you.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // FAQ ----------------------------------------------------------------------
  faqTitle: {
    text: 'Frequently asked questions',
    source: 'src/components/settlement/SettlementFaq.tsx',
  },

  // Where this listing comes from --------------------------------------------
  provenanceTitle: {
    text: 'Where this listing comes from',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  /** "Adapted from SettleSignal (settlesignal.com), used under CC BY 4.0. ClaimMatch may…" */
  provenanceAdaptedFrom: {
    text: 'Adapted from',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  provenanceSite: {
    text: 'SettleSignal (settlesignal.com)',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  provenanceUsedUnder: {
    text: ', used under',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  provenanceLicense: {
    text: 'CC BY 4.0',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  provenanceTail: {
    text: '. ClaimMatch may have shortened or reformatted it. SettleSignal is a listing service, not the settlement’s official site.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  seeSettleSignalListing: {
    text: 'See the SettleSignal listing',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  /** "We found this listing on {host}. That page is a source, not the settlement’s official site." */
  foundListingOn: {
    text: 'We found this listing on',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  sourceNotOfficial: {
    text: 'That page is a source, not the settlement’s official site.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // The web sidebar, shown inline ----------------------------------------------
  sidebarOpenBody: {
    text: 'We’ll guide you to the official site, where you file for free, and help you keep track of your claim.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  signInFirst: {
    text: 'You’ll sign in or create a free account first.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  checklistFileYourself: {
    text: 'You file on the official site yourself',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  checklistNeverFiles: {
    text: 'ClaimMatch never files for you or handles settlement payments',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  checklistSaveNumber: {
    text: 'Save your confirmation number in one place',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  closedNotTaking: {
    text: 'This settlement isn’t taking claims.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  /** Followed by " {date}." */
  closedDeadlineWas: {
    text: 'The deadline listed was',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  closedMayPayAutomatically: {
    text: 'Some settlements pay eligible people automatically. The official site says whether that applies.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  closedAlreadyFiled: {
    text: 'Already filed? Keep the confirmation number the official site gave you.',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },

  // Not found (src/app/lawsuits/[slug]/not-found.tsx) ------------------------
  fictionalTitle: {
    text: 'This was not a real settlement',
    source: 'src/app/lawsuits/[slug]/not-found.tsx',
  },
  fictionalBody: {
    text: 'This listing was test data, not a real settlement, so we removed it. There is nothing to file and nothing you need to do.',
    source: 'src/app/lawsuits/[slug]/not-found.tsx',
  },
  notFoundTitle: {
    text: 'We couldn’t find this settlement',
    source: 'src/app/lawsuits/[slug]/not-found.tsx',
  },
  notFoundBody: {
    text: 'It may have closed, it may be off our list while we re-check it, or the link may be wrong. If you got an official notice about a settlement by mail or email, check the site it names to see if you can still file.',
    source: 'src/app/lawsuits/[slug]/not-found.tsx',
  },
});
