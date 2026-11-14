import { defineCopy } from './types';

/**
 * The corrective notices (D42), verbatim from
 * src/components/claims/CorrectiveNotice.tsx (claim screen) and
 * src/components/claims/CorrectiveNoticeList.tsx (dashboard). The claim and
 * dashboard screens build the components; the one-tap answer labels and
 * confirmations come from legacyAnswerCopy() in @shared/lib/claims.
 *
 * "Claim filed" is quoted on purpose, as on the web: it names the wrong
 * message the old flow showed, in order to correct it (copy-guard ALLOWLIST).
 *
 * Fragments around bold text, a date or a link are joined with single spaces,
 * as the comments say.
 */
export const notices = defineCopy({
  // One legacy claim, on the claim screen (CorrectiveNotice) -----------------
  claimTitle: {
    text: 'Lawsuit AI did not file this claim',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  claimBody: {
    text: 'Earlier, Lawsuit AI showed “Claim filed” for this settlement. That was wrong. We never sent anything to the settlement administrator, and we never file claims for anyone.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  alreadyFiled: {
    text: 'I already filed',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },

  // LegacyClaimGuidance: what to do about one legacy claim ------------------
  /** deadline_passed: "{deadlineWas} **{date}**{deadlineWasTail}" */
  deadlineWas: {
    text: 'The deadline was',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  deadlineWasTail: {
    text: '. If you filed on the official site before then, tell us below.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** Bold lead of the open, closed_on_list and unlisted lines. */
  haventFiledYet: {
    text: 'Haven’t filed yet?',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** open: "**{haventFiledYet}** {stillCan}[ {beforeTheDeadline} **{date}**]." then the link {openClaimForm}. */
  stillCan: {
    text: 'You still can, on the official site',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  beforeTheDeadline: {
    text: 'before the deadline,',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  openClaimForm: {
    text: 'Open the official claim form',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** closed_on_list: "**{haventFiledYet}** {closedOnList} {checkStillTakes}" then the link {checkOfficialSite}. */
  closedOnList: {
    text: 'Our list shows this settlement as closed, and we’re re-checking it.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** unlisted: "**{haventFiledYet}** {unlisted} {checkStillTakes}" then the link {checkOfficialSite}. */
  unlisted: {
    text: 'This settlement is no longer listed on Lawsuit AI while we re-check it.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  checkStillTakes: {
    text: 'Check the official site to see if it still takes claims.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  checkOfficialSite: {
    text: 'Check the official site',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** Appended to the first line when there is no official link (except deadline_passed). */
  noOfficialLink: {
    text: 'We don’t have the official link. Use the link in the notice you got by mail or email, and only file on the site that notice names.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** Second line: "**{alreadyFiledThere}** {dontFileAgain}" */
  alreadyFiledThere: {
    text: 'Already filed there yourself?',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  dontFileAgain: {
    text: 'Don’t file again. Just tell us here.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },

  // Fictional settlements (FictionalNotice, AcknowledgeFictionalButton) ------
  fictionalTitle: {
    text: 'This settlement was not real',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  /** FICTIONAL_TEXT. Claim screen: "“{title}” {fictionalText}"; dashboard row: "{thisSettlement} {fictionalText}". */
  fictionalText: {
    text: 'was test data that should never have been shown as a real settlement. Lawsuit AI did not file anything, and there is nothing for you to do. Please ignore any earlier message about it.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  thisSettlement: {
    text: 'This settlement',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  gotIt: {
    text: 'Got it',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  fictionalDone: {
    text: 'Thanks. We closed this out. There is nothing more to do.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },
  allSet: {
    text: 'You’re all set. Nothing more to do.',
    source: 'src/components/claims/CorrectiveNotice.tsx',
  },

  // The dashboard's list (CorrectiveNoticeList) ------------------------------
  listTitleFictionalOnly: {
    text: 'A settlement in your list was not real',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  listTitleOne: {
    text: 'Lawsuit AI did not file your claim',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  listTitleMany: {
    text: 'Lawsuit AI did not file your claims',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  /** Body (legacy rows only): "{listBodyLead} {the settlement(s) below}{listBodyMiddle} {where things stand}" */
  listBodyLead: {
    text: 'Earlier, Lawsuit AI showed “Claim filed” for',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  theSettlementBelow: {
    text: 'the settlement below',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  theSettlementsBelow: {
    text: 'the settlements below',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  listBodyMiddle: {
    text: '. That was wrong. We never sent anything to a settlement administrator, and we never file claims for anyone.',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  whereThingsStandOne: {
    text: 'Tell us where things stand.',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  whereThingsStandMany: {
    text: 'For each one, tell us where things stand.',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  /** "{gotItForAll} {count} {thatWereNotReal}" */
  gotItForAll: {
    text: 'Got it for all',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  thatWereNotReal: {
    text: 'that were not real',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  closedOutOne: {
    text: 'Thanks. We closed out the settlement that was not real.',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  /** "{closedOutLead} {count} {closedOutManyTail}" */
  closedOutLead: {
    text: 'Thanks. We closed out',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  closedOutManyTail: {
    text: 'settlements that were not real.',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
  /** "{showAll} {count}" */
  showAll: {
    text: 'Show all',
    source: 'src/components/claims/CorrectiveNoticeList.tsx',
  },
});

/** Rows shown before "Show all" (CorrectiveNoticeList NOTICE_PREVIEW). */
export const NOTICE_PREVIEW = 5;

/** The dashboard notice's heading for this many legacy (not fictional) rows. */
export function noticeListTitle(legacyCount: number): string {
  if (legacyCount === 0) return notices.listTitleFictionalOnly.text;
  return legacyCount === 1 ? notices.listTitleOne.text : notices.listTitleMany.text;
}

/** The dashboard notice's body, or null when every row is a fictional settlement. */
export function noticeListBody(legacyCount: number): string | null {
  if (legacyCount === 0) return null;
  const one = legacyCount === 1;
  const below = one ? notices.theSettlementBelow.text : notices.theSettlementsBelow.text;
  const stand = one ? notices.whereThingsStandOne.text : notices.whereThingsStandMany.text;
  return `${notices.listBodyLead.text} ${below}${notices.listBodyMiddle.text} ${stand}`;
}

/** "Got it for all {count} that were not real" (bulk acknowledge button). */
export function gotItForAllLabel(count: number): string {
  return `${notices.gotItForAll.text} ${count} ${notices.thatWereNotReal.text}`;
}

/** What the bulk "Got it" announces after closing out `count` claims. */
export function closedOutMessage(count: number): string {
  return count === 1 ? notices.closedOutOne.text : `${notices.closedOutLead.text} ${count} ${notices.closedOutManyTail.text}`;
}

/** "Show all {count}" under the first NOTICE_PREVIEW rows. */
export function showAllNoticesLabel(count: number): string {
  return `${notices.showAll.text} ${count}`;
}

/** The claim screen's FictionalNotice text: "“{title}” was test data …". */
export function fictionalNoticeText(title: string): string {
  return `“${title}” ${notices.fictionalText.text}`;
}

/** A fictional row on the dashboard: "This settlement was test data …". */
export function fictionalRowText(): string {
  return `${notices.thisSettlement.text} ${notices.fictionalText.text}`;
}
