import { fillCopy } from './shared';
import { defineCopy } from './types';

/**
 * The claim screen (/claim/[slug]), verbatim from src/app/claim/[slug]/page.tsx
 * and src/components/claims/ClaimFlow.tsx with its children. Text cut around
 * a date, a label or a link is kept as fragments that each appear verbatim in
 * the web source; the builders below join them with single spaces, as the web
 * renders them. The corrective and fictional notices use ./notices, and the
 * one-tap answers legacyAnswerCopy() from @shared/lib/claims.
 *
 * mobileOnly entries replace web-only wording ("page", "tab", "refresh the
 * page"), and the web's "dashboard", which is the "Your claims" tab in the
 * app (plan 3.1).
 */

const PAGE = 'src/app/claim/[slug]/page.tsx';
const FLOW = 'src/components/claims/ClaimFlow.tsx';
const REPORT = 'src/components/claims/ReportFiled.tsx';
const ADD = 'src/components/claims/AddConfirmationForm.tsx';
const FIELD = 'src/components/claims/ConfirmationNumberField.tsx';
const PACKET = 'src/components/claims/PrefillPacket.tsx';
const TAB = 'plan 3.1 (the dashboard is the "Your claims" tab)';
const PICKER = 'plan 3.3 (Claim: native date picker)';

export const claim = defineCopy({
  // Screen (page.tsx, loading.tsx) -----------------------------------------------
  screenTitle: { text: 'How to file your claim', source: PAGE },
  loadingSteps: { text: 'Loading the steps for this claim…', source: 'src/app/claim/[slug]/loading.tsx' },
  /** "{loadErrorLead} {what}" (the web's LoadError title). */
  loadErrorLead: { text: 'We couldn’t load', source: PAGE },
  /** The web says "Please refresh the page. If it keeps happening, try again in a few minutes." */
  loadErrorBody: {
    text: 'Tap Try again. If it keeps happening, try again in a few minutes.',
    source: PAGE,
    mobileOnly: true,
  },
  /** The web's "Go to your dashboard". */
  goToYourClaims: { text: 'Go to your claims', source: TAB, mobileOnly: true },

  // Closed card (page.tsx) -----------------------------------------------------------
  closedTitle: { text: 'This settlement is closed', source: PAGE },
  /** "{closedDeadlineWas} {date}{closedNoLongerTaking}" */
  closedDeadlineWas: { text: 'Its deadline was', source: PAGE },
  closedNoLongerTaking: { text: ', so it is no longer taking claims.', source: PAGE },
  closedNoLonger: { text: 'It is no longer taking claims.', source: PAGE },
  /** "{closedIfWrong} {closedCheckOfficial}." when there is an official link. */
  closedIfWrong: { text: 'If you think that’s wrong,', source: PAGE },
  closedCheckOfficial: { text: 'check the official site', source: PAGE },
  closedNoOfficial: {
    text: 'If you think that’s wrong, check the official site: use the link in the notice you got by mail or email.',
    source: PAGE,
  },
  closedKeepConfirmation: {
    text: 'If you filed before the deadline, keep the confirmation the settlement administrator sent you.',
    source: PAGE,
  },

  // StatusPanel and Caveat (ClaimFlow.tsx) --------------------------------------------
  yourClaim: { text: 'Your claim', source: FLOW },
  notTrackingYet: { text: 'Not tracking yet', source: FLOW },
  deadline: { text: 'Deadline', source: FLOW },
  statusNote: {
    text: 'Lawsuit AI doesn’t file claims for you. You file on the official site, then tell us here so we can keep track. Check the official site for the exact deadline time.',
    source: FLOW,
  },
  caveatClosedWithDeadline: {
    text: "Our list marks this settlement as closed, but its deadline hasn't passed. We're re-checking it. Check the official site before you file.",
    source: FLOW,
  },
  caveatClosed: {
    text: "Our list marks this settlement as closed. We're re-checking it. Check the official site before you file.",
    source: FLOW,
  },
  caveatUnlisted: {
    text: 'This settlement is no longer listed on Lawsuit AI while we re-check it. Check the official site before you file.',
    source: FLOW,
  },

  // Links ------------------------------------------------------------------------------------
  /** The web's inline link text, as in "… use the official site." */
  officialSiteLower: { text: 'official site', source: FLOW },
  /** The label of a link to the official site (officialLinkFor). */
  officialSite: { text: 'Official site', source: 'src/lib/lawsuit-display.ts' },

  // NoOfficialLink -----------------------------------------------------------------------
  noOfficialSite: { text: 'We don’t have a link to the official site for this settlement.', source: FLOW },
  /** "{listingCameFrom} {host}{notOfficialLookThere}" */
  listingCameFrom: { text: 'Our listing came from', source: FLOW },
  thisSource: { text: 'this source', source: FLOW },
  notOfficialLookThere: { text: ', which is not the official site. Look there for the official link.', source: FLOW },
  useNoticeLink: { text: 'Use the link in the official notice you got by mail or email.', source: FLOW },
  onlyFileNamed: { text: 'Only file on the official site named in the notice.', source: FLOW },

  // Steps (FilingSteps) ----------------------------------------------------------------
  /** Spoken before each step title (the web's sr-only "Step {n}: "). */
  stepLabel: { text: 'Step {n}:', source: FLOW },
  step1Title: { text: 'Check that you qualify', source: FLOW },
  listingSays: { text: 'What our listing says:', source: FLOW },
  shortSummary: { text: 'This is a short summary, not the official rules.', source: FLOW },
  noRules: { text: 'We don’t have the rules for who qualifies.', source: FLOW },
  readNotice: {
    text: 'Read the official notice to be sure you qualify before you file. Only file if it describes you.',
    source: FLOW,
  },
  readRules: { text: 'Read the rules on the official site', source: FLOW },
  noNoticeLink: {
    text: 'We don’t have a link to the official notice. Use the notice you got by mail or email, or see step 2.',
    source: FLOW,
  },
  notChecked: { text: 'We haven’t checked these details. The official site is the final word.', source: FLOW },
  step2Title: { text: 'File on the official site', source: FLOW },
  openClaimForm: { text: 'Open the official claim form', source: FLOW },
  /**
   * The web says "It opens in a new tab. Keep this page open so you can come
   * back for step 3." Never "inside Lawsuit AI": the official form is not
   * Lawsuit AI's, and Lawsuit AI never files for you.
   */
  opensInBrowser: {
    text: 'It opens the official site in a browser. When you close it, you’ll come back here for step 3.',
    source: 'plan 3.3 (Claim: Step 2 opens the in-app browser, then scrolls to Step 3)',
    mobileOnly: true,
  },
  whatYoullNeed: { text: 'What you’ll need', source: FLOW },
  needDetails: { text: 'Your name, mailing address and email', source: FLOW },
  needNoticeId: {
    text: 'The Notice ID or Claim ID from a letter or email you got about this settlement, if you have one (the form may ask for it)',
    source: FLOW,
  },
  proofRequired: {
    text: 'Proof: required. Have your receipts, account statements or the notice you got ready.',
    source: FLOW,
  },
  proofOptional: { text: 'Proof: optional, but it may raise your payment.', source: FLOW },
  proofNone: { text: 'Proof: our listing says none is needed. The official form has the final say.', source: FLOW },
  proofUnknown: {
    text: 'Proof: check the official form. Some settlements ask for receipts or account records.',
    source: FLOW,
  },
  filingIsFree: {
    text: 'Filing is free. If a site asks you to pay to file a claim, stop. That is not the official site.',
    source: FLOW,
  },
  step3Title: { text: 'Tell us when you’ve filed', source: FLOW },
  /** The web ends "… together on your dashboard." with a link. */
  keepTogether: {
    text: 'We’ll keep your claim, deadline and confirmation number together in Your claims.',
    source: TAB,
    mobileOnly: true,
  },
  /** "{checkOnClaim} {officialSiteLower}." */
  checkOnClaim: { text: 'To check on your claim or update your details, use the', source: FLOW },

  // NoLongerOpen ----------------------------------------------------------------------------
  deadlinePassedTitle: { text: 'The deadline has passed', source: FLOW },
  closedOnListTitle: { text: 'Our list shows this settlement as closed', source: FLOW },
  /** "{deadlineForWas} {date}." then " {didYouFileBy} {lastDay}." or " {didYouFileBelow}" */
  deadlineForWas: { text: 'The deadline for this settlement was', source: FLOW },
  didYouFileBy: { text: 'Did you file before then? Tell us by', source: FLOW },
  didYouFileBelow: { text: 'Did you file before then? Tell us below.', source: FLOW },
  /** "{recheckingLead} {officialSiteLower} {toSeeIfStillTakes}" then "." or useNoticeMailEmail, then alreadyFiledTellUs. */
  recheckingLead: { text: 'We’re re-checking it. Check the', source: FLOW },
  toSeeIfStillTakes: { text: 'to see if it still takes claims', source: FLOW },
  useNoticeMailEmail: { text: ': use the link in the notice you got by mail or email.', source: FLOW },
  alreadyFiledTellUs: {
    text: 'Already filed? Tell us here, and we’ll keep your claim and confirmation number in one place.',
    source: FLOW,
  },
  /** "{forUpdates} {officialSiteLower}." */
  forUpdates: { text: 'For updates, check the', source: FLOW },

  // ReportFiled.tsx -----------------------------------------------------------------------------
  windowClosedClaim: {
    text: 'It has been more than 30 days since the deadline, so this claim can no longer be updated here. If you filed, keep the confirmation the settlement administrator sent you.',
    source: REPORT,
  },
  windowClosedNoClaim: {
    text: 'It has been more than 30 days since the deadline, so a claim can no longer be reported here. If you filed, keep the confirmation the settlement administrator sent you.',
    source: REPORT,
  },
  stoppedTracking: { text: 'You stopped tracking this claim.', source: REPORT },
  cantUpdate: { text: "We can't update this claim here right now. Check the official site for its status.", source: REPORT },
  dateYouFiled: { text: 'Date you filed', source: REPORT },
  optional: { text: '(optional)', source: REPORT },
  iFiledToday: { text: 'I filed today', source: REPORT },
  leaveBlank: { text: 'Leave it blank if you’re not sure.', source: REPORT },
  iFiledMyClaim: { text: 'I filed my claim', source: REPORT },
  saving: { text: 'Saving…', source: REPORT },
  notYetSave: { text: 'Not yet: save to my claims', source: REPORT },
  noNumberYet: { text: 'No confirmation number yet? That’s fine. Tell us now and add it later.', source: REPORT },
  savedSubmitted: { text: 'Saved. Your claim shows as submitted with your confirmation number.', source: REPORT },
  savedReported: {
    text: 'Saved. Your claim shows as Reported filed by you. Add the confirmation number when you get it.',
    source: REPORT,
  },
  /** The web ends "… with its deadline, on your dashboard." */
  savedTracking: {
    text: 'Saved to your claims as Not filed yet. You can find it, with its deadline, in Your claims.',
    source: TAB,
    mobileOnly: true,
  },
  /** "{reportedFiledByYou}" or "{reportedFiledByYou} {reportedOn} {date}" */
  reportedFiledByYou: { text: 'Reported filed by you', source: REPORT },
  reportedOn: { text: 'on', source: REPORT },
  nextAddNumber: {
    text: 'Next, add your confirmation number when you get it. Look for an email from the settlement administrator.',
    source: REPORT,
  },
  undoQuestion: { text: 'Undo your report that you filed?', source: REPORT },
  /** "{undoWarnLead} {lastDay} {undoWarnTail}" */
  undoWarnLead: { text: 'Your claim will show as not filed. After', source: REPORT },
  undoWarnTail: { text: "you won't be able to tell us you filed.", source: REPORT },
  undoWarnNoLimit: { text: 'Your claim will show as not filed until you tell us again.', source: REPORT },
  yesUndo: { text: 'Yes, undo it', source: REPORT },
  keepReport: { text: 'Keep my report', source: REPORT },
  toldByMistake: { text: 'Told us by mistake?', source: REPORT },
  undoButton: { text: 'Undo: I haven’t filed yet', source: REPORT },
  /** "{undoneLead} {label}." or "{undoneLead} {label}{undoneUntil} {lastDay}." */
  undoneLead: { text: 'Undone. Your claim shows as', source: REPORT },
  undoneUntil: { text: '. You can tell us you filed until', source: REPORT },
  keepNumber: {
    text: 'Keep this number. The settlement administrator reviews claims and sends any payment. Watch for their emails and check the official site for updates.',
    source: REPORT,
  },
  /** "{youFiledOn} {date}." */
  youFiledOn: { text: 'You filed on', source: REPORT },
  saveNumber: { text: 'Save number', source: REPORT },
  numberUpdated: { text: 'Saved. Your confirmation number was updated.', source: REPORT },
  correctNumber: { text: 'Correct the number', source: REPORT },

  // AddConfirmationForm.tsx, ConfirmationNumberField.tsx, ClaimError.tsx --------------
  addNumber: { text: 'Add number', source: ADD },
  cancel: { text: 'Cancel', source: ADD },
  savedNowSubmitted: {
    text: 'Saved. Your claim now shows as submitted with your confirmation number.',
    source: ADD,
  },
  confirmationNumber: { text: 'Confirmation number', source: FIELD },
  enterNumber: { text: 'Enter your confirmation number.', source: FIELD },
  checkNumber: { text: 'Check the number.', source: FIELD },
  numberHelp: {
    text: 'Use the number the official site showed you, or emailed you, after you submitted your claim. It may be called a confirmation number, claim number or claim ID. Don’t use a Claim ID, Notice ID or code from a letter, postcard or email you got before you filed.',
    source: FIELD,
  },
  logInAgain: { text: 'Log in again', source: 'src/components/claims/ClaimError.tsx' },

  // The native date picker (the web's <input type="date">) -----------------------------
  chooseDate: { text: 'Choose a date', source: PICKER, mobileOnly: true },
  clearDate: { text: 'Clear the date', source: PICKER, mobileOnly: true },
  doneChoosingDate: { text: 'Done', source: PICKER, mobileOnly: true },

  // PrefillPacket.tsx -----------------------------------------------------------------------
  packetTitle: { text: 'Copy-ready details from your profile', source: PACKET },
  packetNote: {
    text: 'Name, email, phone, address and state you saved. Edit anything that’s wrong, then copy into the official form. Lawsuit AI never files for you.',
    source: PACKET,
  },
  copyAll: { text: 'Copy all', source: PACKET },
  copiedAll: { text: 'Copied all', source: PACKET },
  copy: { text: 'Copy', source: PACKET },
  copied: { text: 'Copied', source: PACKET },
  /** Spoken name of a field's Copy button (the web's button only says "Copy"). */
  copyField: { text: 'Copy {field}', source: 'plan 3.2 (accessibility labels on every control)', mobileOnly: true },
  fullName: { text: 'Full name', source: PACKET },
  email: { text: 'Email', source: PACKET },
  phone: { text: 'Phone', source: PACKET },
  addressLine1: { text: 'Address line 1', source: PACKET },
  addressLine2: { text: 'Address line 2', source: PACKET },
  city: { text: 'City', source: PACKET },
  state: { text: 'State', source: PACKET },
  selectState: { text: 'Select', source: PACKET },
  saveAddressConsent: { text: 'Save this address on my profile for future claims.', source: PACKET },
  consentNeeded: { text: 'Check the box to save these details for future claims.', source: PACKET },
  saveDetails: { text: 'Save these details', source: PACKET },
  saved: { text: 'Saved', source: PACKET },
});

const join = (...parts: string[]) => parts.join(' ');

/** "Step 2: File on the official site", the spoken step heading. */
export function stepHeadingLabel(n: number, title: string): string {
  return join(fillCopy(claim.stepLabel.text, { n: String(n) }), title);
}

/** The LoadError title: "We couldn’t load your claim", or `fallback` when the server's `what` is unknown. */
export function loadErrorTitle(what: string | null, fallback: string): string {
  return what ? join(claim.loadErrorLead.text, what) : fallback;
}

/** The closed card's first sentence; `deadline` is formatted and set only when it has passed. */
export function closedSentence(deadline: string | null): string {
  return deadline ? `${join(claim.closedDeadlineWas.text, deadline)}${claim.closedNoLongerTaking.text}` : claim.closedNoLonger.text;
}

/** "If you think that’s wrong, check the official site." (the closed card, with an official link). */
export function closedIfWrongSentence(): string {
  return `${join(claim.closedIfWrong.text, claim.closedCheckOfficial.text)}.`;
}

/** NoLongerOpen after the deadline: "The deadline for this settlement was {date}. Did you file before then? …" */
export function deadlinePassedSentence(deadline: string, canReport: boolean, lastDay: string | null): string {
  const lead = `${join(claim.deadlineForWas.text, deadline)}.`;
  if (!canReport) return lead;
  return lastDay ? join(lead, `${join(claim.didYouFileBy.text, lastDay)}.`) : join(lead, claim.didYouFileBelow.text);
}

/** NoLongerOpen while our list marks the settlement closed. */
export function recheckingSentence(hasOfficialLink: boolean): string {
  const check = join(claim.recheckingLead.text, claim.officialSiteLower.text, claim.toSeeIfStillTakes.text);
  return join(`${check}${hasOfficialLink ? '.' : claim.useNoticeMailEmail.text}`, claim.alreadyFiledTellUs.text);
}

/** "For updates, check the official site." */
export function forUpdatesSentence(): string {
  return `${join(claim.forUpdates.text, claim.officialSiteLower.text)}.`;
}

/** "To check on your claim or update your details, use the official site." */
export function checkOnClaimSentence(): string {
  return `${join(claim.checkOnClaim.text, claim.officialSiteLower.text)}.`;
}

/** NoOfficialLink: "Our listing came from {host}, which is not the official site. Look there for the official link." */
export function listingSourceSentence(host: string | null): string {
  return `${join(claim.listingCameFrom.text, host ?? claim.thisSource.text)}${claim.notOfficialLookThere.text}`;
}

/** "Reported filed by you on Oct 30, 2026" (`filedOn` formatted). */
export function reportedTitle(filedOn: string | null): string {
  return filedOn ? join(claim.reportedFiledByYou.text, claim.reportedOn.text, filedOn) : claim.reportedFiledByYou.text;
}

/** The undo confirmation's warning (`lastDay` formatted). */
export function undoWarning(lastDay: string | null): string {
  return lastDay ? join(claim.undoWarnLead.text, lastDay, claim.undoWarnTail.text) : claim.undoWarnNoLimit.text;
}

/** What "Yes, undo it" announces (`lastDay` formatted). */
export function undoneMessage(label: string, lastDay: string | null): string {
  const lead = join(claim.undoneLead.text, label);
  return lastDay ? `${lead}${join(claim.undoneUntil.text, lastDay)}.` : `${lead}.`;
}

/** The submitted card's note, with " You filed on {date}." when known (`filedOn` formatted). */
export function submittedNote(filedOn: string | null): string {
  return filedOn ? join(claim.keepNumber.text, `${join(claim.youFiledOn.text, filedOn)}.`) : claim.keepNumber.text;
}

/** "Copy Full name" (a field's Copy button). */
export function copyFieldLabel(field: string): string {
  return fillCopy(claim.copyField.text, { field });
}
