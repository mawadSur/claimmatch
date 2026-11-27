import { defineCopy } from './types';

/**
 * One-click filing in the app (issue #51), verbatim from the web's
 * ONE_CLICK_* copy in src/lib/copy.ts. Text the web builds around a value
 * (a date, a count, a name) is kept as fragments that each appear verbatim
 * there; the builders below join them as the web renders them. Status,
 * timeline, lane-reason and timing texts are flat entries here (the parity
 * check reads flat groups) and are looked up through the maps at the end.
 *
 * mobileOnly entries replace web-only words ("refresh the page") or name
 * what only the app has (the photo library next to the camera).
 */

const COPY = 'src/lib/copy.ts';
const MODEL = 'src/components/filing/filing-model.ts';
const APP = 'plan 3.3 (Claim: one-click filing in the app, issue #51)';

export const filing = defineCopy({
  agentTitle: { text: 'We file this claim for you', source: COPY },
  selfFileTitle: { text: 'Finish on the official site', source: COPY },
  agentNote: {
    text: 'We file this claim for you after you sign it. Any payment comes to you from the settlement administrator, not from Lawsuit AI.',
    source: COPY,
  },
  selfFileNote: {
    text: 'Lawsuit AI doesn’t file this claim for you. You finish it on the official site, then tell us here so we can keep track. Check the official site for the exact deadline time.',
    source: COPY,
  },
  stepsLabel: { text: 'How to file with Lawsuit AI', source: COPY },
  stepConfirm: { text: 'Confirm this describes you', source: COPY },
  stepNeed: { text: 'What we still need', source: COPY },
  stepReview: { text: 'Review and sign', source: COPY },
  stepStatus: { text: 'Your claim’s status', source: COPY },

  entryIntro: {
    text: 'Add what’s missing, review your claim and sign it by typing your name. You don’t need to leave Lawsuit AI.',
    source: COPY,
  },
  entryStart: { text: 'Start my claim', source: COPY },
  entryStarting: { text: 'Starting…', source: COPY },
  entryOrSelfFile: {
    text: 'Prefer to do it yourself? The steps below show how to file on the official site.',
    source: COPY,
  },
  payout: { text: 'Any payment comes to you from the settlement administrator, never through Lawsuit AI.', source: COPY },
  /** "{lastDayLead} {date} {lastDayTail}" */
  lastDayLead: { text: 'Sign by', source: COPY },
  lastDayTail: { text: 'so there is time to file it before the deadline.', source: COPY },

  confirmIntro: {
    text: 'This is the official description of who is included in the settlement, word for word:',
    source: COPY,
  },
  confirmSource: { text: 'Read it on the official site', source: COPY },
  confirmOfficialForm: { text: 'The official claim form', source: COPY },
  confirmCheckbox: { text: 'This describes me.', source: COPY },
  confirmWarning: {
    text: 'Only continue if it does. Filing a claim you don’t qualify for can be against the law.',
    source: COPY,
  },

  needIntro: {
    text: 'Lawsuit AI filled in what it already has from your profile. Add what’s missing and answer this settlement’s questions, which use the official form’s wording.',
    source: COPY,
  },
  fromProfile: { text: 'From your profile', source: COPY },
  changeDetails: { text: 'Change these details', source: COPY },
  required: { text: 'Required', source: COPY },
  optional: { text: 'Optional', source: COPY },
  save: { text: 'Save my answers', source: COPY },
  saving: { text: 'Saving…', source: COPY },
  saved: { text: 'Your answers are saved.', source: COPY },
  saveToProfile: {
    text: 'Also save my name, contact details and address to my profile for future claims.',
    source: COPY,
  },
  choose: { text: 'Choose one', source: COPY },
  yes: { text: 'Yes', source: COPY },
  no: { text: 'No', source: COPY },
  empty: { text: 'Not added yet', source: COPY },
  healthTitle: { text: 'Health information', source: COPY },
  healthCheckbox: { text: 'I agree to share the health information this claim asks for, as described above.', source: COPY },
  nothingToAsk: { text: 'Nothing else is needed here. Check your claim in the next step.', source: COPY },
  invalidNumber: { text: 'Enter a number.', source: COPY },
  invalidWhole: { text: 'Enter a whole number.', source: COPY },
  invalidMoney: { text: 'Enter an amount, like 12.50.', source: COPY },
  invalidEmail: { text: 'Enter an email address, like name@example.com.', source: COPY },
  invalidZip: { text: 'Enter a 5-digit ZIP code.', source: COPY },
  lockedSigned: { text: 'You signed this claim, so this can’t change. Make a change to edit it.', source: COPY },
  lockedHealth: { text: 'Agree to share health information above to answer this.', source: COPY },
  lockedNotCollected: { text: 'Lawsuit AI doesn’t collect this. Enter it on the official site.', source: COPY },

  docsTakePhoto: { text: 'Take a photo', source: COPY },
  /** The web's file input offers the photo library itself; the app has a separate button for it. */
  docsChoosePhoto: { text: 'Choose a photo', source: APP, mobileOnly: true },
  docsCameraDenied: {
    text: 'Lawsuit AI can’t use the camera. Allow it in Settings, or choose a photo instead.',
    source: APP,
    mobileOnly: true,
  },
  docsChooseFile: { text: 'Choose a file', source: COPY },
  docsTypes: { text: 'JPG, PNG, HEIC, WebP or PDF, up to 10 MB each.', source: COPY },
  /** "{n} {docsCountOf} {max} {docsCountAdded}" */
  docsCountOf: { text: 'of', source: COPY },
  docsCountAdded: { text: 'added', source: COPY },
  /** "{docsUploading} {pct}%" */
  docsUploading: { text: 'Uploading…', source: COPY },
  docsChecking: { text: 'Checking the file…', source: COPY },
  docsStored: { text: 'Added', source: COPY },
  docsPending: { text: 'Not finished', source: COPY },
  docsRejected: { text: 'Couldn’t be used', source: COPY },
  docsFailed: { text: 'The upload didn’t finish.', source: COPY },
  docsRetry: { text: 'Try again', source: COPY },
  docsRemove: { text: 'Remove', source: COPY },
  docsView: { text: 'View', source: COPY },
  docsTooBig: { text: 'That file is over 10 MB. Choose a smaller one.', source: COPY },
  docsWrongType: { text: 'That file type can’t be used. Choose a JPG, PNG, HEIC, WebP or PDF.', source: COPY },
  docsFull: { text: 'You’ve added as many files as this item takes.', source: COPY },
  /** "{docsFile} {n} ({size})" */
  docsFile: { text: 'File', source: COPY },

  reviewIntro: { text: 'Check everything below. It is what Lawsuit AI sends, in the official form’s order.', source: COPY },
  reviewChange: { text: 'Change', source: COPY },
  reviewNotReady: { text: 'Before you can sign, finish these:', source: COPY },
  statementTitle: { text: 'The official sworn statement', source: COPY },
  statementIntro: { text: 'The official claim form asks you to agree to this statement, word for word:', source: COPY },
  statementCheckbox: { text: 'I have read this statement, and it is true for me.', source: COPY },
  authorizationTitle: { text: 'Your authorization for Lawsuit AI', source: COPY },
  authorizationCheckbox: {
    text: 'I authorize Lawsuit AI to file this one claim for me, as described above.',
    source: COPY,
  },
  /** "{version} {v}" */
  version: { text: 'Version', source: COPY },
  typedName: { text: 'Type your full legal name to sign', source: COPY },
  /** "{typedNameHint} {name}" */
  typedNameHint: { text: 'Type it as it appears on this claim:', source: COPY },
  typedNameMismatch: {
    text: 'That doesn’t match the legal name on this claim. Type it exactly as shown.',
    source: COPY,
  },
  signHint: {
    text: 'Your typed name is your electronic signature for this exact claim. Each claim is signed on its own.',
    source: COPY,
  },
  tickStatement: { text: 'Tick the box to agree to the sworn statement.', source: COPY },
  tickAuthorization: { text: 'Tick the box to authorize Lawsuit AI for this claim.', source: COPY },
  fileButton: { text: 'File my claim', source: COPY },
  signing: { text: 'Signing…', source: COPY },
  signed: { text: 'You signed your claim.', source: COPY },

  oneTapTitle: { text: 'Your details are ready', source: COPY },
  oneTapIntro: {
    text: 'Lawsuit AI already has what this claim needs from your profile. Check the summary, then submit.',
    source: COPY,
  },
  oneTapEdit: { text: 'Edit details', source: COPY },
  oneTapHide: { text: 'Hide details', source: COPY },
  oneTapSubmit: { text: 'Submit this claim', source: COPY },
  oneTapSubmitting: { text: 'Submitting…', source: COPY },
  oneTapDisclosureLead: {
    text: 'By submitting, you confirm this class describes you, the official statement is true for you, you authorize Lawsuit AI for this one claim, and you sign as',
    source: COPY,
  },
  oneTapClassTitle: { text: 'Who this settlement includes', source: COPY },
  oneTapNext: { text: 'Submit next claim', source: COPY },
  oneTapNextHint: { text: 'Next eligible claim:', source: COPY },

  esignTitle: { text: 'Before you sign electronically', source: COPY },
  esignCheckbox: { text: 'I have read this and agree to use electronic records and signatures.', source: COPY },
  esignAgree: { text: 'Agree and continue', source: COPY },
  esignDone: { text: 'You agreed to use electronic records and signatures.', source: COPY },
  esignTick: { text: 'Tick the box to agree first.', source: COPY },

  reauthTitle: { text: 'For your security, sign in again', source: COPY },
  reauthBody: {
    text: 'Filing a claim needs a sign-in with your password in the last 15 minutes. A sign-in link from an email doesn’t count.',
    source: COPY,
  },
  reauthPassword: { text: 'Password', source: COPY },
  reauthSubmit: { text: 'Sign in', source: COPY },
  reauthChecking: { text: 'Signing in…', source: COPY },
  reauthWrong: { text: 'That password didn’t work. Try again, or set a new one.', source: COPY },
  reauthEnter: { text: 'Enter your password.', source: COPY },
  reauthNoPassword: { text: 'No password yet, or forgot it?', source: COPY },
  reauthSetPassword: { text: 'Set a password', source: COPY },
  reauthDone: { text: 'You’re signed in. You can sign your claim now.', source: COPY },

  selfFile: { text: 'Finish on the official site instead', source: COPY },
  selfFileConfirm: {
    text: 'Lawsuit AI won’t file this claim. Your answers stay here so you can copy them into the official form.',
    source: COPY,
  },
  selfFileYes: { text: 'Yes, I’ll finish it myself', source: COPY },
  selfFileDone: { text: 'You’ll finish this claim on the official site. Your answers are ready to copy.', source: COPY },
  reopen: { text: 'Make a change', source: COPY },
  reopenConfirm: { text: 'Changing your claim cancels your signature. You’ll review it and sign again.', source: COPY },
  reopenYes: { text: 'Cancel my signature and edit', source: COPY },
  reopenDone: { text: 'Your signature is canceled. Make your changes, then sign again.', source: COPY },
  withdraw: { text: 'Withdraw this claim', source: COPY },
  withdrawConfirm: { text: 'Lawsuit AI won’t file this claim.', source: COPY },
  withdrawReason: { text: 'Why are you withdrawing it?', source: COPY },
  withdrawChangedMind: { text: 'I changed my mind', source: COPY },
  withdrawFiledMyself: { text: 'I filed it myself', source: COPY },
  withdrawNotEligible: { text: 'It doesn’t describe me', source: COPY },
  withdrawOther: { text: 'Something else', source: COPY },
  withdrawYes: { text: 'Withdraw', source: COPY },
  withdrawDone: { text: 'You withdrew this claim.', source: COPY },
  keep: { text: 'Keep it', source: COPY },
  working: { text: 'Working…', source: COPY },
  confirmationTitle: { text: 'Add the confirmation number', source: COPY },
  confirmationLabel: { text: 'Confirmation or claim number', source: COPY },
  confirmationHelp: {
    text: 'If the settlement administrator emailed you a confirmation or claim number for this claim, enter it here.',
    source: COPY,
  },
  confirmationSave: { text: 'Save the number', source: COPY },
  confirmationEmpty: { text: 'Enter the confirmation or claim number.', source: COPY },
  confirmationDone: { text: 'The confirmation number is saved.', source: COPY },
  started: { text: 'Your claim is started. Work through the steps below.', source: COPY },

  preparedTitle: { text: 'Your prepared answers', source: COPY },
  preparedIntro: { text: 'Copy these into the official form, in this order.', source: COPY },
  copy: { text: 'Copy', source: COPY },
  copied: { text: 'Copied', source: COPY },
  preparedOneFile: { text: '1 file added here. Upload it on the official site too.', source: COPY },
  /** "{n} {preparedFiles}" */
  preparedFiles: { text: 'files added here. Upload them on the official site too.', source: COPY },

  timelineTitle: { text: 'What has happened so far', source: COPY },
  timelineYou: { text: 'You', source: COPY },
  timelineLawsuitAi: { text: 'Lawsuit AI', source: COPY },
  timelineOther: { text: 'Status updated', source: COPY },
  /** "{signedByLead} {name} {signedByOn} {when}" */
  signedByLead: { text: 'Signed by', source: COPY },
  signedByOn: { text: 'on', source: COPY },
  /** The web says "Please refresh the page." */
  loadFailed: {
    text: 'We couldn’t load this claim’s filing details. Pull down to refresh.',
    source: COPY,
    mobileOnly: true,
  },
  network: { text: 'We couldn’t reach Lawsuit AI. Check your connection and try again.', source: COPY },
});

/** ONE_CLICK_STATUS, flattened. */
export const filingStatus = defineCopy({
  preparingLabel: { text: 'Preparing your claim', source: COPY },
  preparingDetail: { text: 'Add what’s missing and answer the settlement’s questions below.', source: COPY },
  readyLabel: { text: 'Ready to file', source: COPY },
  readyDetail: { text: 'Everything is in. Review your claim and sign it.', source: COPY },
  signedLabel: { text: 'Signed by you', source: COPY },
  signedDetail: { text: 'You signed this claim. It’s being put in line now.', source: COPY },
  queuedLabel: { text: 'In line to be filed', source: COPY },
  queuedDetail: { text: 'Your signed claim is in line. You can still change or withdraw it until filing starts.', source: COPY },
  filingLabel: { text: 'Filing in progress', source: COPY },
  filingDetail: { text: 'Filing has started, so this claim can’t be changed or withdrawn right now.', source: COPY },
  filedLabel: { text: 'Filed by Lawsuit AI · waiting for the confirmation number', source: COPY },
  filedDetail: {
    text: 'The settlement administrator hasn’t sent a confirmation number yet. It will show here when it arrives. If the administrator emails it to you, you can add it yourself.',
    source: COPY,
  },
  needsYouLabel: { text: 'Needs your attention', source: COPY },
  needsYouDetail: {
    text: 'Lawsuit AI needs something from you before this claim can go ahead. Fix the items below, then sign again.',
    source: COPY,
  },
  rejectedLabel: { text: 'Not accepted by the administrator', source: COPY },
  rejectedDetail: {
    text: 'The settlement administrator didn’t accept this claim from Lawsuit AI. You can still finish it yourself on the official site before the deadline.',
    source: COPY,
  },
  submittedLabel: { text: 'Submitted', source: COPY },
  submittedDetail: {
    text: 'The settlement administrator gave this claim a confirmation number. Keep it for your records.',
    source: COPY,
  },
  withdrawnLabel: { text: 'Withdrawn by you', source: COPY },
  withdrawnDetail: { text: 'You withdrew this claim. Lawsuit AI won’t file it.', source: COPY },
  selfFileDetail: {
    text: 'Lawsuit AI can’t file this claim for you. Finish it on the official site. Your answers are ready to copy.',
    source: COPY,
  },
});

/** ONE_CLICK_EVENTS, ONE_CLICK_LANE_REASONS, ONE_CLICK_TIMING and the status path, flattened. */
export const filingEvents = defineCopy({
  preparing: { text: 'Started the claim', source: COPY },
  ready: { text: 'All answers in', source: COPY },
  signed: { text: 'Signed the claim', source: COPY },
  queued: { text: 'Put in line to be filed', source: COPY },
  filing: { text: 'Filing started', source: COPY },
  filedByClaimmatch: { text: 'Filed with the settlement administrator', source: COPY },
  submitted: { text: 'Confirmation number received', source: COPY },
  needsYou: { text: 'Asked for something to be fixed', source: COPY },
  filingRejected: { text: 'Not accepted by the administrator', source: COPY },
  selfFile: { text: 'Moved to finish on the official site', source: COPY },
  reportedFiled: { text: 'Reported filing it on the official site', source: COPY },
  notReportedFiled: { text: 'Deadline passed without a report', source: COPY },
  withdrawn: { text: 'Withdrew the claim', source: COPY },

  reasonNotOffered: { text: 'Lawsuit AI can’t file claims for this settlement right now.', source: COPY },
  reasonNotOpen: { text: 'This settlement isn’t taking claims right now.', source: COPY },
  reasonDeadline: { text: 'The deadline is too close for Lawsuit AI to file this claim in time.', source: COPY },
  reasonState: { text: 'Lawsuit AI can’t file this claim for people in your state yet.', source: COPY },
  reasonHealth: { text: 'This claim asks for health information, which you haven’t agreed to share.', source: COPY },
  reasonProof: {
    text: 'This claim needs proof that Lawsuit AI can’t send to this settlement’s administrator.',
    source: COPY,
  },

  timingDesk: {
    text: 'After you sign, a Lawsuit AI team member enters your signed claim on the official site, usually within a few business days.',
    source: COPY,
  },
  timingEmail: {
    text: 'After you sign, Lawsuit AI emails your signed claim to the settlement administrator’s published claims address and emails you a copy.',
    source: COPY,
  },
  timingBulk: {
    text: 'After you sign, Lawsuit AI adds your signed claim to a file for the settlement administrator, in the format the administrator asks for. This can take a few days.',
    source: COPY,
  },
  timingApi: { text: 'After you sign, Lawsuit AI sends your signed claim to the settlement administrator’s system.', source: COPY },

  pathPreparing: { text: 'Preparing', source: MODEL },
  pathReady: { text: 'Ready to file', source: MODEL },
  pathSigned: { text: 'Signed', source: MODEL },
  pathQueued: { text: 'In line', source: MODEL },
  pathFiling: { text: 'Filing', source: MODEL },
  pathFiled: { text: 'Filed', source: MODEL },
  pathSubmitted: { text: 'Confirmation number', source: MODEL },
});

// Builders ---------------------------------------------------------------------

export const lastDaySentence = (date: string) => `${filing.lastDayLead.text} ${date} ${filing.lastDayTail.text}`;
export const docsCountText = (n: number, max: number) =>
  `${n} ${filing.docsCountOf.text} ${max} ${filing.docsCountAdded.text}`;
export const docsUploadingText = (pct: number) => `${filing.docsUploading.text} ${pct}%`;
export const docsFileText = (n: number, size: string) => `${filing.docsFile.text} ${n} (${size})`;
export const versionText = (v: string) => `${filing.version.text} ${v}`;
export const typedNameHintText = (name: string) => `${filing.typedNameHint.text} ${name}`;
export const preparedFilesText = (n: number) =>
  n === 1 ? filing.preparedOneFile.text : `${n} ${filing.preparedFiles.text}`;
export const signedByText = (name: string, when: string) =>
  `${filing.signedByLead.text} ${name} ${filing.signedByOn.text} ${when}`;
export const oneTapDisclosureText = (name: string) => `${filing.oneTapDisclosureLead.text} ${name}.`;
export const oneTapNextHintText = (title: string) => `${filing.oneTapNextHint.text} ${title}`;
