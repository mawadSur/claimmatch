/**
 * Shared public copy. Keep fee and filing language in one place so home,
 * pricing and tests cannot drift.
 */

import { flags } from '@/lib/flags';

/** Official-administrator filing has no filing charge. Not a Lawsuit AI price. */
export const OFFICIAL_FILING_IS_FREE = 'Filing on the official site is always free.';

/** @deprecated Use OFFICIAL_FILING_IS_FREE. Kept so existing imports stay valid. */
export const FILING_FREE_WARNING = OFFICIAL_FILING_IS_FREE;

/**
 * Recovery share, in percent. Owner decision: Lawsuit AI files the claim and
 * charges this share only if the user is paid. Public pages show this only
 * when FEE_DISCLOSURE_ENABLED=1.
 */
export const CLAIMMATCH_FEE_RATE = 15;

export function feeEveryClaimCopy(rate = CLAIMMATCH_FEE_RATE): string {
  return (
    `Lawsuit AI files the claim for you and charges ${rate} percent only if you get paid. ` +
    'The settlement administrator pays you directly.'
  );
}

/**
 * Who files, for public pages. True when Lawsuit AI may file some claims for
 * the member: the fee disclosure says so (FEE_DISCLOSURE_ENABLED) or one-click
 * filing is on (ONE_CLICK_FILING_ENABLED). Off: "never files for you" stays true.
 */
export function lawsuitAiMayFile(
  f: Pick<typeof flags, 'feeDisclosure' | 'oneClickFiling'> = flags,
): boolean {
  return f.feeDisclosure() || f.oneClickFiling();
}

const MAY_FILE_SENTENCE =
  'For some settlements, Lawsuit AI files this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.';

/** Answer to "Do you file claims for me?" / "Who files my claim?". */
export function whoFilesAnswer(mayFile = lawsuitAiMayFile()): string {
  return mayFile
    ? `It depends on the settlement. ${MAY_FILE_SENTENCE} Any payment comes to you from the settlement administrator.`
    : 'No. You file every claim yourself on the official settlement website. Lawsuit AI never files for you.';
}

/** The "who files" trust fact on home and /trust. */
export function filingFact(mayFile = lawsuitAiMayFile()): { title: string; body: string } {
  return mayFile
    ? { title: 'Every claim goes to the official administrator', body: MAY_FILE_SENTENCE }
    : {
        title: 'You file on the official site',
        body: 'You file every claim on the settlement’s own website, where filing is always free. Lawsuit AI never files for you.',
      };
}

/** Primary match CTA when ASSISTED_FILING_ENABLED=1. */
export const FILE_FOR_YOU_CTA = 'We’ll file it for you';

/** Secondary self-file link next to the primary filing CTA. */
export const SELF_FILE_SECONDARY = 'Copy details and file yourself';

export const BETA_FEE_COPY =
  'Lawsuit AI is free during beta. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.';

/** Softened beta line. Shown only when PANEL_TRUST_COPY_ENABLED=1 (counsel review). */
export const NEUTRAL_BETA_FEE_COPY =
  'Free during beta. Any future pricing will be shown before you use it.';

export const BROWSE_NO_ACCOUNT =
  'Browsing listings and opening the official claim form need no account.';

export const ACCOUNT_FOR_SAVE_WHY =
  'Create an account only to save matches or get deadline alerts.';

export const WHAT_WE_STORE_MINIMAL =
  'We store your name and email so you can sign in. After onboarding we store the state and answers you give so we can match settlements. No phone. Street address only if a claim form needs it.';

/** Public cost line. Beta wording until counsel flips FEE_DISCLOSURE_ENABLED. */
export function publicCostNote(disclose: boolean): string {
  return disclose ? feeEveryClaimCopy() : `${OFFICIAL_FILING_IS_FREE} ${publicBetaFeeCopy()}`;
}

/** Live beta fee sentence. Neutral wording is behind PANEL_TRUST_COPY_ENABLED. */
export function publicBetaFeeCopy(neutral = flags.panelTrustCopy()): string {
  return neutral ? NEUTRAL_BETA_FEE_COPY : BETA_FEE_COPY;
}

/* -------------------------------------------------------------------------- */
/* One-click filing (ONE_CLICK_FILING_ENABLED, docs/designs/one-click-filing.md) */
/* -------------------------------------------------------------------------- */

/**
 * Agent lanes only: shown for a claim whose settlement has a filing channel
 * the law firm enabled. Copy guard: exact-text allowlist entry.
 */
export const ONE_CLICK_AGENT_TITLE = 'Lawsuit AI files this claim for you';

/** The self-file lane: no channel is enabled, so the member finishes on the official site. */
export const ONE_CLICK_SELF_FILE_TITLE = 'Finish on the official site';

/** claim_status filed_by_claimmatch. Never "Submitted" until the administrator's number arrives. */
export const ONE_CLICK_FILED_LABEL = 'Filed by Lawsuit AI · waiting for the confirmation number';

/** The claim page's status note on an agent lane. */
export const ONE_CLICK_AGENT_NOTE =
  'Lawsuit AI files this claim for you after you sign it. Any payment comes to you from the settlement administrator, not from Lawsuit AI.';

/** The claim page's status note on the self-file lane while one-click filing is on. */
export const ONE_CLICK_SELF_FILE_NOTE =
  'Lawsuit AI doesn’t file this claim for you. You finish it on the official site, then tell us here so we can keep track. Check the official site for the exact deadline time.';

/** Member-safe lane reasons (MEMBER_LANE_REASONS). Disputes, kill switches and staffing are never named. */
export const ONE_CLICK_LANE_REASONS = {
  not_offered_for_settlement: 'Lawsuit AI can’t file claims for this settlement right now.',
  settlement_not_open: 'This settlement isn’t taking claims right now.',
  deadline_too_close: 'The deadline is too close for Lawsuit AI to file this claim in time.',
  state_not_covered: 'Lawsuit AI can’t file this claim for people in your state yet.',
  health_consent_needed: 'This claim asks for health information, which you haven’t agreed to share.',
  proof_not_supported: 'This claim needs proof that Lawsuit AI can’t send to this settlement’s administrator.',
} as const;

/** What happens after signing, per agent channel (the member never sees staffing or capacity). */
export const ONE_CLICK_TIMING = {
  filing_desk:
    'After you sign, a Lawsuit AI team member enters your signed claim on the official site, usually within a few business days.',
  administrator_email:
    'After you sign, Lawsuit AI emails your signed claim to the settlement administrator’s published claims address and emails you a copy.',
  administrator_bulk:
    'After you sign, Lawsuit AI adds your signed claim to a file for the settlement administrator, in the format the administrator asks for. This can take a few days.',
  administrator_api: 'After you sign, Lawsuit AI sends your signed claim to the settlement administrator’s system.',
} as const;

/** Claim status labels for the agent lanes (displayClaimStatus covers the self-file statuses). */
export const ONE_CLICK_STATUS = {
  preparing: { label: 'Preparing your claim', detail: 'Add what’s missing and answer the settlement’s questions below.' },
  ready: { label: 'Ready to file', detail: 'Everything is in. Review your claim and sign it.' },
  signed: { label: 'Signed by you', detail: 'You signed this claim. It’s being put in line now.' },
  queued: {
    label: 'In line to be filed',
    detail: 'Your signed claim is in line. You can still change or withdraw it until filing starts.',
  },
  filing: { label: 'Filing in progress', detail: 'Filing has started, so this claim can’t be changed or withdrawn right now.' },
  filed_by_claimmatch: {
    label: ONE_CLICK_FILED_LABEL,
    detail:
      'The settlement administrator hasn’t sent a confirmation number yet. It will show here when it arrives. If the administrator emails it to you, you can add it yourself.',
  },
  needs_you: {
    label: 'Needs your attention',
    detail: 'Lawsuit AI needs something from you before this claim can go ahead. Fix the items below, then sign again.',
  },
  filing_rejected: {
    label: 'Not accepted by the administrator',
    detail:
      'The settlement administrator didn’t accept this claim from Lawsuit AI. You can still finish it yourself on the official site before the deadline.',
  },
  submitted: { label: 'Submitted', detail: 'The settlement administrator gave this claim a confirmation number. Keep it for your records.' },
  withdrawn: { label: 'Withdrawn by you', detail: 'You withdrew this claim. Lawsuit AI won’t file it.' },
  self_file: {
    label: ONE_CLICK_SELF_FILE_TITLE,
    detail: 'Lawsuit AI can’t file this claim for you. Finish it on the official site. Your answers are ready to copy.',
  },
} as const;

/** One line per claim_events row (timeline). */
export const ONE_CLICK_EVENTS: Readonly<Record<string, string>> = {
  preparing: 'Started the claim',
  ready: 'All answers in',
  signed: 'Signed the claim',
  queued: 'Put in line to be filed',
  filing: 'Filing started',
  filed_by_claimmatch: 'Filed with the settlement administrator',
  submitted: 'Confirmation number received',
  needs_you: 'Asked for something to be fixed',
  filing_rejected: 'Not accepted by the administrator',
  self_file: 'Moved to finish on the official site',
  reported_filed: 'Reported filing it on the official site',
  not_reported_filed: 'Deadline passed without a report',
  withdrawn: 'Withdrew the claim',
};

export const ONE_CLICK_COPY = {
  stepsLabel: 'How to file with Lawsuit AI',
  steps: { confirm: 'Confirm this describes you', need: 'What we still need', review: 'Review and sign', status: 'Your claim’s status' },
  entry: {
    intro: 'Add what’s missing, review your claim and sign it by typing your name. You don’t need to leave Lawsuit AI.',
    start: 'Start my claim',
    starting: 'Starting…',
    orSelfFile: 'Prefer to do it yourself? The steps below show how to file on the official site.',
  },
  payout: 'Any payment comes to you from the settlement administrator, never through Lawsuit AI.',
  lastDay: (date: string) => `Sign by ${date} so there is time to file it before the deadline.`,
  confirm: {
    intro: 'This is the official description of who is included in the settlement, word for word:',
    source: 'Read it on the official site',
    officialForm: 'The official claim form',
    checkbox: 'This describes me.',
    warning: 'Only continue if it does. Filing a claim you don’t qualify for can be against the law.',
  },
  need: {
    intro: 'Lawsuit AI filled in what it already has from your profile. Add what’s missing and answer this settlement’s questions, which use the official form’s wording.',
    fromProfile: 'From your profile',
    change: 'Change these details',
    required: 'Required',
    optional: 'Optional',
    save: 'Save my answers',
    saving: 'Saving…',
    saved: 'Your answers are saved.',
    saveToProfile: 'Also save my name, contact details and address to my profile for future claims.',
    choose: 'Choose one',
    yes: 'Yes',
    no: 'No',
    empty: 'Not added yet',
    healthTitle: 'Health information',
    healthCheckbox: 'I agree to share the health information this claim asks for, as described above.',
    nothingToAsk: 'Nothing else is needed here. Check your claim in the next step.',
    invalidNumber: 'Enter a number.',
    invalidWhole: 'Enter a whole number.',
    invalidMoney: 'Enter an amount, like 12.50.',
    invalidEmail: 'Enter an email address, like name@example.com.',
    invalidZip: 'Enter a 5-digit ZIP code.',
    locked: {
      packet_signed: 'You signed this claim, so this can’t change. Make a change to edit it.',
      health_consent_needed: 'Agree to share health information above to answer this.',
      not_collected: 'Lawsuit AI doesn’t collect this. Enter it on the official site.',
    },
  },
  docs: {
    takePhoto: 'Take a photo',
    chooseFile: 'Choose a file',
    types: 'JPG, PNG, HEIC, WebP or PDF, up to 10 MB each.',
    count: (n: number, max: number) => `${n} of ${max} added`,
    uploading: (pct: number) => `Uploading… ${pct}%`,
    checking: 'Checking the file…',
    stored: 'Added',
    pending: 'Not finished',
    rejected: 'Couldn’t be used',
    failed: 'The upload didn’t finish.',
    retry: 'Try again',
    remove: 'Remove',
    view: 'View',
    tooBig: 'That file is over 10 MB. Choose a smaller one.',
    wrongType: 'That file type can’t be used. Choose a JPG, PNG, HEIC, WebP or PDF.',
    full: 'You’ve added as many files as this item takes.',
    file: (n: number, size: string) => `File ${n} (${size})`,
  },
  review: {
    intro: 'Check everything below. It is what Lawsuit AI sends, in the official form’s order.',
    change: 'Change',
    notReady: 'Before you can sign, finish these:',
    statementTitle: 'The official sworn statement',
    statementIntro: 'The official claim form asks you to agree to this statement, word for word:',
    statementCheckbox: 'I have read this statement, and it is true for me.',
    authorizationTitle: 'Your authorization for Lawsuit AI',
    authorizationCheckbox: 'I authorize Lawsuit AI to file this one claim for me, as described above.',
    version: (v: string) => `Version ${v}`,
    typedName: 'Type your full legal name to sign',
    typedNameHint: (name: string) => `Type it as it appears on this claim: ${name}`,
    typedNameMismatch: 'That doesn’t match the legal name on this claim. Type it exactly as shown.',
    signHint: 'Your typed name is your electronic signature for this exact claim. Each claim is signed on its own.',
    tickStatement: 'Tick the box to agree to the sworn statement.',
    tickAuthorization: 'Tick the box to authorize Lawsuit AI for this claim.',
    fileButton: 'File my claim',
    signing: 'Signing…',
    signed: 'You signed your claim.',
  },
  esign: {
    title: 'Before you sign electronically',
    checkbox: 'I have read this and agree to use electronic records and signatures.',
    agree: 'Agree and continue',
    saving: 'Saving…',
    done: 'You agreed to use electronic records and signatures.',
    tick: 'Tick the box to agree first.',
  },
  reauth: {
    title: 'For your security, sign in again',
    body: 'Filing a claim needs a sign-in with your password in the last 15 minutes. A sign-in link from an email doesn’t count.',
    password: 'Password',
    submit: 'Sign in',
    checking: 'Signing in…',
    wrong: 'That password didn’t work. Try again, or set a new one.',
    enter: 'Enter your password.',
    noPassword: 'No password yet, or forgot it?',
    setPassword: 'Set a password',
    done: 'You’re signed in. You can sign your claim now.',
  },
  actions: {
    selfFile: 'Finish on the official site instead',
    selfFileConfirm: 'Lawsuit AI won’t file this claim. Your answers stay here so you can copy them into the official form.',
    selfFileYes: 'Yes, I’ll finish it myself',
    selfFileDone: 'You’ll finish this claim on the official site. Your answers are ready to copy.',
    reopen: 'Make a change',
    reopenConfirm: 'Changing your claim cancels your signature. You’ll review it and sign again.',
    reopenYes: 'Cancel my signature and edit',
    reopenDone: 'Your signature is canceled. Make your changes, then sign again.',
    withdraw: 'Withdraw this claim',
    withdrawConfirm: 'Lawsuit AI won’t file this claim.',
    withdrawReason: 'Why are you withdrawing it?',
    withdrawReasons: {
      changed_mind: 'I changed my mind',
      filed_myself: 'I filed it myself',
      not_eligible: 'It doesn’t describe me',
      other: 'Something else',
    },
    withdrawYes: 'Withdraw',
    withdrawDone: 'You withdrew this claim.',
    keep: 'Keep it',
    working: 'Working…',
    confirmationTitle: 'Add the confirmation number',
    confirmationLabel: 'Confirmation or claim number',
    confirmationHelp: 'If the settlement administrator emailed you a confirmation or claim number for this claim, enter it here.',
    confirmationSave: 'Save the number',
    confirmationEmpty: 'Enter the confirmation or claim number.',
    confirmationDone: 'The confirmation number is saved.',
    started: 'Your claim is started. Work through the steps below.',
  },
  prepared: {
    title: 'Your prepared answers',
    intro: 'Copy these into the official form, in this order.',
    copy: 'Copy',
    copied: 'Copied',
    files: (n: number) => (n === 1 ? '1 file added here. Upload it on the official site too.' : `${n} files added here. Upload them on the official site too.`),
  },
  timeline: { title: 'What has happened so far', you: 'You', claimmatch: 'Lawsuit AI', other: 'Status updated' },
  signedBy: (name: string, when: string) => `Signed by ${name} on ${when}`,
  loadFailed: 'We couldn’t load this claim’s filing details. Please refresh the page.',
  network: 'We couldn’t reach Lawsuit AI. Check your connection and try again.',
  dashboard: {
    title: 'Filing status',
    intro: 'Claims you started with Lawsuit AI, and where each one stands.',
    ready: 'Ready to file',
    needsYou: 'Need your attention',
    open: 'Open',
    failed: 'We couldn’t load your filing status right now. Please refresh the page in a minute.',
  },
  dashboardIntro: 'Track your claims and what happens next. Lawsuit AI never handles settlement payments.',
  welcomeSteps: [
    'Find an open settlement in our list.',
    'Read the official notice to see if you qualify.',
    'Follow the steps on the claim page to file.',
    'Check each claim’s status and confirmation number here.',
  ],
} as const;
