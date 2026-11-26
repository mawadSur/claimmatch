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
    text: 'Free. We help you file.',
    source: 'src/lib/copy.ts',
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
    text: 'How to file',
    source: 'src/app/lawsuits/[slug]/page.tsx',
  },
  stepQualifyTitle: {
    text: 'Check that you qualify',
    source: 'src/lib/settlement-howto.ts',
  },
  stepQualifyBody: {
    text: 'Read the official notice. It has the exact rules and the deadline.',
    source: 'src/lib/settlement-howto.ts',
  },
  stepFileTitle: {
    text: 'We help you file',
    source: 'src/lib/copy.ts',
  },
  stepFileBody: {
    text: 'We help you file. Filing is free on the official site. You can always file this claim yourself. Lawsuit AI never handles settlement payments.',
    source: 'src/lib/copy.ts',
  },
  /** SETTLEMENT_FILING_COPY.agent.step — one-click on and this settlement has an agent lane. */
  stepFileTitleAgent: {
    text: 'We file this claim for you',
    source: 'src/lib/copy.ts',
  },
  stepFileBodyAgent: {
    text: 'We file this claim for you after you review and sign it, if you qualify and live in a state it covers. You can always file on the official site yourself instead, where filing is free. Lawsuit AI never handles settlement payments.',
    source: 'src/lib/copy.ts',
  },
  /** SETTLEMENT_FILING_COPY.self_file.step — guides without an agent lane. */
  stepFileTitleSelfFile: {
    text: 'We help you file',
    source: 'src/lib/copy.ts',
  },
  stepFileBodySelfFile: {
    text: 'We help you file. Filing is free on the official site. You can always file this claim yourself. Lawsuit AI never handles settlement payments.',
    source: 'src/lib/copy.ts',
  },
  /** Generic may-file (flag on, catalog API has no lane): MAY_FILE_PAGE_COPY.inviteStep. */
  stepFileTitleMayFile: {
    text: 'We file claims for you on supported settlements',
    source: 'src/lib/copy.ts',
  },
  stepFileBodyMayFileTail: {
    text: 'Otherwise you file on the settlement’s official website. Lawsuit AI is not a law firm.',
    source: 'src/lib/copy.ts',
  },
  stepTrackTitle: {
    text: 'Keep track in Lawsuit AI',
    source: 'src/lib/settlement-howto.ts',
  },
  stepTrackBody: {
    text: 'Tell us when you’ve filed and save the confirmation number the official site gives you.',
    source: 'src/lib/settlement-howto.ts',
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
  /** "Adapted from SettleSignal (settlesignal.com), used under CC BY 4.0. Lawsuit AI may…" */
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
    text: '. Lawsuit AI may have shortened or reformatted it. SettleSignal is a listing service, not the settlement’s official site.',
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
    text: 'We help you file. Filing is free on the official site. You can always file this claim yourself.',
    source: 'src/lib/copy.ts',
  },
  signInFirst: {
    text: 'Create an account only to save matches or get deadline alerts.',
    source: 'src/lib/copy.ts',
  },
  checklistFileYourself: {
    text: 'We help you file',
    source: 'src/lib/copy.ts',
  },
  checklistNeverFiles: {
    text: 'You can always file on the official site yourself',
    source: 'src/lib/copy.ts',
  },
  checklistSaveNumber: {
    text: 'Save your confirmation number in one place',
    source: 'src/app/lawsuits/[slug]/page.tsx',
    mobileOnly: true,
  },
  checklistAgentCanFile: {
    text: 'We file this claim for you after you review and sign it',
    source: 'src/lib/copy.ts',
  },
  checklistAlwaysOfficial: {
    text: 'You can always file on the official site yourself instead',
    source: 'src/lib/copy.ts',
  },
  checklistNeverHandlesPayments: {
    text: 'Lawsuit AI never handles settlement payments',
    source: 'src/lib/copy.ts',
  },
  checklistSelfFileOfficial: {
    text: 'You can always file on the official site yourself',
    source: 'src/lib/copy.ts',
  },
  /** SOME_SETTLEMENTS — generic may-file when the catalog API has no lane. */
  checklistSomeSettlements: {
    text: 'We file claims for you on supported settlements after you review and sign them.',
    source: 'src/lib/copy.ts',
  },
  checklistAlwaysOfficialSite: {
    text: 'You can always file on the official settlement website yourself.',
    source: 'src/lib/copy.ts',
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

/**
 * Who-files mode on the settlement screen (mirrors src/app/lawsuits/[slug]/page.tsx
 * settlementFilingMode). The catalog API does not send a lane, so `agentLane`
 * is null unless a caller already has one (tests, or a later payload). Flag
 * off keeps never_files; flag on without a lane is generic may-file.
 */
export type SettlementFilingUiMode = 'never_files' | 'agent' | 'self_file' | 'may_file';

export function settlementFilingUiMode(
  oneClickOn: boolean,
  agentLane?: boolean | null,
): SettlementFilingUiMode {
  if (!oneClickOn) return 'never_files';
  if (agentLane === true) return 'agent';
  if (agentLane === false) return 'self_file';
  return 'may_file';
}

export function settlementFileStep(mode: SettlementFilingUiMode): { title: string; body: string } {
  if (mode === 'agent') return { title: settlement.stepFileTitleAgent.text, body: settlement.stepFileBodyAgent.text };
  if (mode === 'self_file') return { title: settlement.stepFileTitleSelfFile.text, body: settlement.stepFileBodySelfFile.text };
  if (mode === 'may_file') {
    return {
      title: settlement.stepFileTitleMayFile.text,
      body: `${settlement.checklistSomeSettlements.text} ${settlement.stepFileBodyMayFileTail.text}`,
    };
  }
  return { title: settlement.stepFileTitle.text, body: settlement.stepFileBody.text };
}

export function settlementChecklist(mode: SettlementFilingUiMode): readonly string[] {
  if (mode === 'agent') {
    return [
      settlement.checklistAgentCanFile.text,
      settlement.checklistAlwaysOfficial.text,
      settlement.checklistNeverHandlesPayments.text,
    ];
  }
  if (mode === 'self_file') {
    return [
      settlement.checklistSelfFileOfficial.text,
      settlement.checklistNeverHandlesPayments.text,
      settlement.checklistSaveNumber.text,
    ];
  }
  if (mode === 'may_file') {
    return [
      settlement.checklistSomeSettlements.text,
      settlement.checklistAlwaysOfficialSite.text,
      settlement.checklistNeverHandlesPayments.text,
    ];
  }
  return [
    settlement.checklistFileYourself.text,
    settlement.checklistNeverFiles.text,
    settlement.checklistSaveNumber.text,
  ];
}
