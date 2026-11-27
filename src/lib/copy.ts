/**
 * Shared public copy. Keep fee and filing language in one place so home,
 * pricing and tests cannot drift.
 */

import { flags } from '@/lib/flags';
import { SITE } from '@/lib/utils';

/** Official-administrator filing has no filing charge. Not a Lawsuit AI price. */
export const OFFICIAL_FILING_IS_FREE = 'Filing on the official site is always free.';

/** @deprecated Use OFFICIAL_FILING_IS_FREE. Kept so existing imports stay valid. */
export const FILING_FREE_WARNING = OFFICIAL_FILING_IS_FREE;

/**
 * Membership price and trial. Public pages show this only when
 * SUBSCRIPTION_BILLING_ENABLED=1. Interpolate from these constants so the
 * dollar amount cannot drift across Pricing, Terms, FAQ, and e-sign text.
 */
export const CLAIMMATCH_TRIAL_DAYS = 7;
export const CLAIMMATCH_MEMBERSHIP_PRICE_CENTS = 1999;

export function membershipPriceCopy(cents = CLAIMMATCH_MEMBERSHIP_PRICE_CENTS): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
}

/** Public membership sentence: free browsing/self-file, paid Easy submit + alerts. */
export function membershipCopy(
  trialDays = CLAIMMATCH_TRIAL_DAYS,
  price = membershipPriceCopy(),
): string {
  return (
    `Browsing, matching, and filing yourself on official settlement sites stay free. ` +
    `Easy submit and new-claim alerts are included with Lawsuit AI membership: a ${trialDays}-day free trial, then ${price} a month, cancel anytime. ` +
    `Lawsuit AI takes 0 percent of your settlement payouts. Administrators pay you directly and you keep 100 percent. ` +
    `Lawsuit AI never holds or redirects settlement funds.`
  );
}

/**
 * The settlement's own listed payout, shown beside the membership price so the
 * cost sits next to the figure the listing states. `label` comes from
 * `statedPayoutLabel` (src/lib/owed-estimate.ts) and is always the listing's
 * own payout_min / payout_max — never estimated, rounded or promised. Callers
 * render nothing at all when the listing states no amount.
 */
export function listedPayoutBesidePriceCopy(label: string): string {
  return (
    `This settlement lists ${label} per eligible person. ` +
    `That is the listing’s own figure, not a prediction of what you will receive.`
  );
}

/* ---------------------------------------------------------------------------
   Home hero, above the fold.

   Every figure in these strings is interpolated from a number the caller
   computed from the catalog at render time. Nothing here is averaged across
   settlements, rounded up, or promised: when the caller has no figure it
   renders nothing in that figure's place. The administrator decides who is
   paid and how much, so no sentence here may say a visitor will receive money.
   --------------------------------------------------------------------------- */

/**
 * The hero headline, in two parts so the hero can italicise the second half
 * without a second copy of the words living in the component.
 */
export const HOME_HERO_HEADLINE_LEAD = 'Find the settlements';
export const HOME_HERO_HEADLINE_EMPHASIS = 'that may be yours.';
export const HOME_HERO_HEADLINE = `${HOME_HERO_HEADLINE_LEAD} ${HOME_HERO_HEADLINE_EMPHASIS}`;

/** Sits under the price block, not under the headline: the payout line is the hook. */
export const HOME_HERO_SUBHEAD =
  'Search open US class-action settlements, read who qualifies on the official notice, and keep every claim and deadline in one list.';

/**
 * "Open now: settlements listing up to $5,000 per person". `label` is one
 * settlement's own stated maximum, already formatted; the caller names the
 * listing beside it so the figure is checkable rather than asserted.
 */
export function heroPayoutHeadline(label: string): string {
  return `Open now: settlements listing up to ${label} per person`;
}

/** "the highest is Acme Data Breach" — attribution for the figure above. */
export function heroPayoutSource(title: string): string {
  return `the highest is ${title}`;
}

/**
 * The same attribution as an accessible name. "the highest is Acme" does not
 * tell a screen-reader user that the link opens that settlement, and this is
 * the only route by which a reader can check the headline figure.
 */
export function heroPayoutSourceLabel(title: string): string {
  return `${title} — the listing stating the highest amount`;
}

/**
 * "median $250 of the 22 settlements that list an amount · 98 open now".
 *
 * The median is never printed beside the open count alone. Most open listings
 * state no per-person amount at all, so "median $250 · 98 open" reads as the
 * typical open settlement paying $250 — which the catalog does not support.
 * The median therefore carries its own denominator or is not shown.
 *
 * There is no cadence claim here. The catalog ingest runs daily
 * (vercel.json: /api/cron/daily), and the hero already prints the real
 * refresh timestamp in the badge above, so a second hardcoded "updated
 * monthly" was both false and redundant.
 */
export function heroPayoutSupport(parts: {
  medianLabel?: string | null;
  statedCount?: number | null;
  openLabel?: string | null;
}): string | null {
  const bits: string[] = [];
  if (parts.medianLabel && parts.statedCount && parts.statedCount > 0) {
    bits.push(
      parts.statedCount === 1
        ? `the one settlement that lists an amount lists ${parts.medianLabel}`
        : `median ${parts.medianLabel} of the ${parts.statedCount.toLocaleString('en-US')} settlements that list an amount`,
    );
  }
  if (parts.openLabel) bits.push(`${parts.openLabel} open now`);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * Real scarcity, counted from deadlines. Never shown when the count is zero.
 *
 * It says "in the next 30 days" because that is the window the caller counts
 * (CLOSING_SOON_DAYS). "This month" would be a calendar claim the count does
 * not support: a 30-day window crosses into the following month.
 */
export function heroClosingLine(count: number): string {
  return count === 1
    ? '1 settlement closes in the next 30 days'
    : `${count} settlements close in the next 30 days`;
}

/**
 * How payment reaches the member. True and load-bearing: administrators pay
 * the member directly and many offer Zelle, PayPal or Venmo as an option on
 * their own form (see PAYOUT_PREFERENCE_LABELS in src/lib/claim-profile.ts and
 * the payout-options editor). Method names only — no brand marks, which would
 * imply an affiliation that does not exist.
 */
export const HOME_HERO_PAYMENT_CLARITY =
  'The administrator pays you directly — many let you choose Zelle, PayPal, Venmo or a check. We never see your account details.';

export const HOME_HERO_FREE_LINE = 'Free to search and track.';

/**
 * The membership price, above the fold. "No card to start" is true: the trial
 * checkout runs with payment_method_collection 'if_required'.
 *
 * The filing clause is named only when `mayFile` is true. Easy submit is
 * gated by lawsuitAiMayFile() (FEE_DISCLOSURE / ONE_CLICK_FILING), and
 * advertising it while that gate is shut is the exact claim #80 removed from
 * the public pages — so with the gate shut the line prices the membership by
 * what it does do instead of by filing.
 */
export function homeHeroPriceLine(
  mayFile = lawsuitAiMayFile(),
  trialDays = CLAIMMATCH_TRIAL_DAYS,
  price = membershipPriceCopy(),
): string {
  const what = mayFile
    ? 'Easy submit — we prepare and file it for you'
    : 'Membership — new-claim alerts and every deadline tracked';
  return `${what} — is ${price}/mo after a ${trialDays}-day free trial, no card to start.`;
}

/**
 * A stated payout, formatted for display without rounding it into a figure no
 * listing states. formatOwedUsd rounds to whole dollars, which turns a stated
 * $12.50 cap into "$13" and a stated $0.50 into "$1" — directly under a note
 * reading "Amounts are what each listing states". Cents are kept whenever the
 * amount has them, and an amount that would render as nothing returns null so
 * the caller drops the line instead of printing "$0".
 */
export function statedAmountLabel(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const totalCents = Math.round(amount * 100);
  // Below half a cent there is no figure to show; "$0" under "Amounts are
  // what each listing states" is worse than showing nothing.
  if (totalCents === 0) return null;
  const hasCents = totalCents % 100 !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount);
}

export const HOME_HERO_PRIMARY_CTA = 'See which settlements fit you';

/** Who sets the amount. Sits with the payout figures so they are never read as an offer. */
export const HOME_HERO_PAYOUT_NOTE =
  'Amounts are what each listing states. The settlement administrator decides who is paid and how much.';

export function startTrialCtaLabel(
  trialDays = CLAIMMATCH_TRIAL_DAYS,
  price = membershipPriceCopy(),
): string {
  return `Start ${trialDays}-day free trial (${price}/mo after)`;
}

/** @deprecated Use membershipCopy. Same public membership sentence. */
export function feeEveryClaimCopy(): string {
  return membershipCopy();
}

/**
 * Who files, for public pages. True when Lawsuit AI may file some claims for
 * the member: membership copy is on (SUBSCRIPTION_BILLING_ENABLED) or one-click
 * filing is on (ONE_CLICK_FILING_ENABLED). Off: "never files for you" stays true.
 */
export function lawsuitAiMayFile(
  f: Pick<typeof flags, 'feeDisclosure' | 'oneClickFiling'> = flags,
): boolean {
  return f.feeDisclosure() || f.oneClickFiling();
}

/**
 * Site-wide core message while Lawsuit AI may file. Counsel: may file for
 * some settlements — never imply every settlement.
 */
export const WE_FILE_SUPPORTED = 'We file claims for you on supported settlements';
export const WE_FILE_THIS_CLAIM = 'We file this claim for you';
export const WE_FILE_FOR_YOU_BADGE = 'We file for you';
export const WE_FILE_SUPPORTED_SENTENCE =
  'We file claims for you on supported settlements. You can always file on the official site yourself instead, where filing is free.';

/**
 * Guide-page wording when this settlement has no agent lane. Counsel-cleared:
 * we help you file; we do not claim to file this claim for you.
 */
export const WE_HELP_YOU_FILE = 'We help you file';
export const WE_HELP_YOU_PREPARE = 'We help you prepare it';
export const GET_PAID_AUTOMATICALLY = 'Get paid automatically';
export const WE_HELP_YOU_FILE_SENTENCE =
  'We help you file. You can always file on the official site yourself, where filing is free.';
export const WE_HELP_YOU_FILE_BODY =
  'We help you file. Filing is free on the official site. You can always file this claim yourself. Lawsuit AI never handles settlement payments.';
export const WE_FILE_THIS_CLAIM_GUIDE =
  'Free. We file this claim for you on this settlement.';
export const WE_HELP_YOU_FILE_GUIDE = 'Free. We help you file.';

/** Guide-page Easy submit line. Membership wording when billing is on. */
export function weFileThisClaimGuide(disclose = flags.feeDisclosure()): string {
  return disclose
    ? `Easy submit is included with membership: a ${CLAIMMATCH_TRIAL_DAYS}-day free trial, then ${membershipPriceCopy()}/mo. Filing yourself on the official site stays free.`
    : WE_FILE_THIS_CLAIM_GUIDE;
}

export const SIGNUP_INTRO_MAY_FILE =
  'Keep track of your settlement claims in one place. We file claims for you on supported settlements. You can always file on the official site yourself instead, where filing is free.';
/** Official-site filing is always available; Easy submit is extra on eligible claims. */
export const FILE_OR_EASY_SUBMIT =
  'File free on the official site yourself, or use Easy submit on eligible claims and we submit it for you after you e-sign.';
export const SIGNUP_INTRO_NEVER_FILES =
  `Keep track of the settlement claims you file, all in one place. ${FILE_OR_EASY_SUBMIT}`;

export const CATALOG_INTRO_NEVER_FILES =
  'Class action settlements that are taking claims now. Check who qualifies on the official site, file there for free, and keep track of your claim in Lawsuit AI.';
export const CATALOG_INTRO_MAY_FILE =
  'Class action settlements that are taking claims now. Check who qualifies on the official site. File free on the official site yourself, or use Easy submit on eligible claims and we submit it for you after you e-sign.';

/** Catalog / trust bullet: supported settlements vs self-file. */
export function whoFilesBullet(mayFile = lawsuitAiMayFile()): string {
  return mayFile ? WE_FILE_SUPPORTED : 'You file on the official site';
}

export const MAY_FILE_SENTENCE = WE_FILE_SUPPORTED_SENTENCE;

/**
 * Disclaimer sentences used instead of "does not file … for anyone" while
 * lawsuitAiMayFile() is true (src/lib/disclaimer.ts). Owner-approved wording
 * for the one-click launch; have counsel review before turning the flags on.
 */
export const MAY_FILE_LEGAL_SENTENCE =
  `${FILE_OR_EASY_SUBMIT} Lawsuit AI never receives or handles settlement payments.`;
export const MAY_FILE_SHORT_SENTENCE = FILE_OR_EASY_SUBMIT;

/** Answer to "Do you file claims for me?" / "Who files my claim?". */
export function whoFilesAnswer(mayFile = lawsuitAiMayFile()): string {
  return mayFile
    ? `Yes, on supported settlements. ${WE_FILE_SUPPORTED_SENTENCE} Any payment comes to you from the settlement administrator.`
    : 'No. You file every claim yourself on the official settlement website. Lawsuit AI never files for you.';
}

/** The "who files" trust fact on home and /trust. */
export function filingFact(mayFile = lawsuitAiMayFile()): { title: string; body: string } {
  return mayFile
    ? { title: WE_FILE_SUPPORTED, body: WE_FILE_SUPPORTED_SENTENCE }
    : {
        title: 'You file on the official site',
        body: 'You file every claim on the settlement’s own website, where filing is always free. Lawsuit AI never files for you.',
      };
}

/*
 * Public pages while Lawsuit AI may file for the viewer (issue #53). Each
 * page keeps its "never files" text for viewers one-click is not on for
 * (src/lib/filing/public-filing.ts decides); these replace it otherwise.
 * Counsel to approve with the other one-click texts.
 */

/** never_files: one-click is not on for this viewer. agent: it is, and this settlement has an agent lane. */
export type SettlementFilingMode = 'never_files' | 'agent' | 'self_file';

/** The settlement page's "How filing works" step 2 and sidebar points, per mode other than never_files. */
export const SETTLEMENT_FILING_COPY = {
  agent: {
    step: {
      title: WE_FILE_THIS_CLAIM,
      body: 'We file this claim for you after you review and sign it, if you qualify and live in a state it covers. You can always file on the official site yourself instead, where filing is free. Lawsuit AI never handles settlement payments.',
    },
    points: [
      'We file this claim for you after you review and sign it',
      'You can always file on the official site yourself instead',
      'Lawsuit AI never handles settlement payments',
    ],
  },
  self_file: {
    step: {
      title: WE_HELP_YOU_FILE,
      body: WE_HELP_YOU_FILE_BODY,
    },
    points: [
      WE_HELP_YOU_FILE,
      'You can always file on the official site yourself',
      'Lawsuit AI never handles settlement payments',
    ],
  },
  easy_submit: {
    step: {
      title: 'Easy submit',
      body: `${FILE_OR_EASY_SUBMIT} Lawsuit AI never handles settlement payments.`,
    },
    points: [
      FILE_OR_EASY_SUBMIT,
      'You can always file on the official site yourself instead',
      'Lawsuit AI never handles settlement payments',
    ],
  },
} as const;

/** Guide pages: Easy submit only after an approved agent lane; drafts fall back to self-file. */
export function guideFilingCopy(mode: SettlementFilingMode, deskFile = false) {
  if (deskFile && mode === 'agent') return SETTLEMENT_FILING_COPY.easy_submit;
  return mode === 'agent' ? SETTLEMENT_FILING_COPY.agent : SETTLEMENT_FILING_COPY.self_file;
}

export const SOME_SETTLEMENTS =
  'We file claims for you on supported settlements after you review and sign them.';

/** Site-wide pages (invite, onboarding, scorecard) when Lawsuit AI may file for this viewer. */
export const MAY_FILE_PAGE_COPY = {
  inviteIntro:
    'Lawsuit AI helps you find open US class-action settlements, get your claim ready and keep track of it. We file claims for you on supported settlements after you sign them; otherwise you submit on the official site. It is free during beta.',
  inviteIntroMembership:
    'Lawsuit AI helps you find open US class-action settlements, get your claim ready and keep track of it. Easy submit is included with membership: a 7-day free trial, then $19.99/month, cancel anytime. Browsing and filing yourself on the official site stay free.',
  inviteStep: {
    title: 'We file claims for you on supported settlements',
    body: `${SOME_SETTLEMENTS} Otherwise you file on the settlement’s official website. Lawsuit AI is not a law firm.`,
  },
  inviteBullet: 'You can always file on the official settlement website yourself.',
  onboardingIntro:
    'Lawsuit AI is a free claim assistant. We file claims for you on supported settlements after you review and sign them. It never handles settlement payments.',
  onboardingIntroMembership:
    'Lawsuit AI is a claim assistant. Easy submit is included with membership after a 7-day free trial, then $19.99/month, cancel anytime. We file claims for you on supported settlements after you review and sign them. It never handles settlement payments.',
  onboardingStep: `We file claims for you on supported settlements after you review and sign them. You can always file on the official site yourself instead, where it’s free.`,
  onboardingStepMembership: `Easy submit is included with membership. We file claims for you on supported settlements after you review and sign them. You can always file on the official site yourself instead, where it’s free.`,
  scorecard: `${SOME_SETTLEMENTS} Otherwise you file on the official settlement site yourself. Lawsuit AI never handles settlement payments.`,
} as const;

export function inviteIntroCopy(mayFile: boolean, disclose = flags.feeDisclosure()): string {
  if (mayFile) return disclose ? MAY_FILE_PAGE_COPY.inviteIntroMembership : MAY_FILE_PAGE_COPY.inviteIntro;
  return disclose
    ? 'Lawsuit AI helps you find open US class-action settlements, copy a packet for the official form, and keep track of what you file. You can always file on the official site yourself. Easy submit and new-claim alerts are included with membership.'
    : 'Lawsuit AI helps you find open US class-action settlements, copy a packet for the official form, and keep track of what you file. You submit on the official site. It is free during beta.';
}

export function onboardingIntroCopy(mayFile: boolean, disclose = flags.feeDisclosure()): string {
  if (disclose) {
    return mayFile
      ? MAY_FILE_PAGE_COPY.onboardingIntroMembership
      : 'Lawsuit AI is a claim assistant. Easy submit is included with membership after a 7-day free trial, then $19.99/month. It never handles settlement payments.';
  }
  return mayFile
    ? MAY_FILE_PAGE_COPY.onboardingIntro
    : 'Lawsuit AI is a free claim assistant. It never files for you and never handles settlement payments.';
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

export const ACCOUNT_FOR_SAVE_WHY_MEMBERSHIP =
  'Create an account to save matches, get new-claim alerts included with membership, or use Easy submit on eligible claims.';

/** Why an account exists, including filing when Lawsuit AI may file. */
export function accountGateWhy(
  mayFile = lawsuitAiMayFile(),
  disclose = flags.feeDisclosure(),
): string {
  if (disclose) return ACCOUNT_FOR_SAVE_WHY_MEMBERSHIP;
  return mayFile
    ? 'Create an account only to save matches, get deadline alerts, or have us file on supported settlements.'
    : ACCOUNT_FOR_SAVE_WHY;
}

/**
 * Anyone can file on the administrator site with no Lawsuit AI account.
 * Not a Lawsuit AI price.
 */
export const FILE_FREE_DIRECTLY =
  'Anyone can file for free on the official settlement website. You never need a Lawsuit AI account to file.';

/** What Lawsuit AI adds besides the free official form. Flag-aware for who files. */
export function lawsuitAiValueLine(mayFile = lawsuitAiMayFile()): string {
  return mayFile
    ? 'Lawsuit AI helps you find settlements that may apply to you, reminds you of deadlines, and files claims for you on supported settlements after you review and sign.'
    : 'Lawsuit AI helps you find settlements that may apply to you and reminds you of deadlines. You file every claim yourself on the official site.';
}

export const WHAT_WE_STORE_MINIMAL =
  'We store your name and email so you can sign in. After onboarding we store the state and answers you give so we can match settlements. Phone is optional — add it in Settings if a claim form needs it; we never ask for it at sign-up. Street address only if a claim form needs it.';

/** Matching never asks for SSN or bank details. Checkable against eligibility.ts and Jev. */
export const NO_SSN_OR_BANK_TO_MATCH =
  'We never ask for your Social Security number or bank account details to match you with settlements.';

export const NEVER_CHARGE_UPFRONT =
  'We never charge you upfront to browse, match, or open an official claim form.';

export const OPERATOR_LEGAL_NAME = 'Lawsuit AI LLC';
export const OPERATOR_JURISDICTION = 'Wyoming';
export const PUBLIC_CONTACT_EMAIL = 'hello@lawsuitai.org';

/** ISO date these public operator facts were last checked against the live product. Never invent a later date. */
export const TRUST_FACTS_CHECKED_ON = '2026-11-25';

export function operatorLine(
  legalEntity: string | null = OPERATOR_LEGAL_NAME,
): string {
  const name = legalEntity?.trim() || OPERATOR_LEGAL_NAME;
  return `${SITE.name} is operated by ${name}, a ${OPERATOR_JURISDICTION} limited liability company.`;
}

/** Public cost line. Beta wording until SUBSCRIPTION_BILLING_ENABLED is on. */
export function publicCostNote(disclose: boolean): string {
  return disclose ? membershipCopy() : `${OFFICIAL_FILING_IS_FREE} ${publicBetaFeeCopy()}`;
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
export const ONE_CLICK_AGENT_TITLE = WE_FILE_THIS_CLAIM;

/** The self-file lane: no channel is enabled, so the member finishes on the official site. */
export const ONE_CLICK_SELF_FILE_TITLE = 'Finish on the official site';

/** claim_status filed_by_claimmatch. Never "Submitted" until the administrator's number arrives. */
export const ONE_CLICK_FILED_LABEL = 'Filed by Lawsuit AI · waiting for the confirmation number';

/** The claim page's status note on an agent lane. */
export const ONE_CLICK_AGENT_NOTE =
  'We file this claim for you after you sign it. Any payment comes to you from the settlement administrator, not from Lawsuit AI.';

/**
 * Per-claim disclaimer sentence (go-live checklist item 13): replaces the
 * filing sentence of the legal disclaimer on a claim page only when Lawsuit AI
 * files that claim (an agent lane the law firm enabled, one-click on). Every
 * other claim keeps the site-wide sentence. Counsel to approve.
 */
export const CLAIM_AGENT_LEGAL_SENTENCE =
  'For this claim, after you review and sign it, Lawsuit AI files this claim for you with the settlement administrator; you can still choose to file it yourself on the official site instead. Lawsuit AI never receives or handles settlement payments.';

/** PrefillPacket's lead on a claim Lawsuit AI may file: the details are for filing it yourself instead. */
export const PREFILL_AGENT_LANE_NOTE =
  'Name, email, phone, address and state you saved. If you would rather file on the official site yourself, edit anything that’s wrong and copy it into the official form. We file this claim for you only after you choose Easy submit and sign it.';

/** PrefillPacket's lead on Easy submit (`desk_file`) when one-click is not yet offering start. */
export const PREFILL_EASY_SUBMIT_NOTE =
  'Name, email, phone, address and state you saved. Edit anything that’s wrong. Easy submit uses these details after you e-sign, or copy them into the official form if you file yourself.';

/**
 * PrefillPacket's lead on a claim Lawsuit AI does not file. Scoped to the
 * claim on screen: Easy submit exists on eligible claims (SHORT_DISCLAIMER),
 * so a site-wide "never files for you" here would contradict the footer.
 */
export const PREFILL_SELF_FILE_NOTE =
  'Name, email, phone, address and state you saved. Edit anything that’s wrong, then copy into the official form. Lawsuit AI doesn’t file this claim for you.';

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
  oneTap: {
    title: 'Your details are ready',
    intro:
      'Lawsuit AI already has what this claim needs from your profile. Check the summary, then submit.',
    edit: 'Edit details',
    hide: 'Hide details',
    submit: 'Submit this claim',
    submitting: 'Submitting…',
    disclosure: (name: string) =>
      `By submitting, you confirm this class describes you, the official statement is true for you, you authorize Lawsuit AI for this one claim, and you sign as ${name}.`,
    classTitle: 'Who this settlement includes',
    next: 'Submit next claim',
    nextHint: (title: string) => `Next eligible claim: ${title}`,
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
    googleBody: 'Filing a claim needs a sign-in in the last 15 minutes, with Google or your password. A sign-in link from an email doesn’t count.',
    google: 'Sign in again with Google',
    googleWorking: 'Opening Google…',
    googleFailed: 'We couldn’t open Google sign-in. Try again, or use your password.',
    appleBody: 'Filing a claim needs a sign-in in the last 15 minutes, with Apple or your password. A sign-in link from an email doesn’t count.',
    apple: 'Sign in again with Apple',
    appleWorking: 'Opening Apple…',
    appleFailed: 'We couldn’t open Apple sign-in. Try again, or use your password.',
    /** An account linked to both Google and Apple. */
    bothBody: 'Filing a claim needs a sign-in in the last 15 minutes, with Google, Apple or your password. A sign-in link from an email doesn’t count.',
    orPassword: 'Or use your password',
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
  historyToggle: 'Show or hide the history',
  dashboard: {
    title: 'Filing status',
    intro: 'Claims you started with Lawsuit AI, and where each one stands.',
    ready: 'Ready to file',
    needsYou: 'Need your attention',
    open: 'Open',
    showList: 'Show or hide your claims',
    failed: 'We couldn’t load your filing status right now. Please refresh the page in a minute.',
  },
  dashboardIntro: `Track your claims and what happens next. ${WE_FILE_SUPPORTED}. Lawsuit AI never handles settlement payments.`,
  dashboardMembership:
    'Browsing and filing yourself stay free. Easy submit is included with membership: a 7-day free trial, then $19.99 a month, cancel anytime.',
  welcomeSteps: [
    'Find an open settlement in our list.',
    'Read the official notice to see if you qualify.',
    'We file claims for you on supported settlements, or you file on the official site.',
    'Check each claim’s status and confirmation number here.',
  ],
} as const;

/**
 * "Continue with Google" (issue #50, OAUTH_SIGN_IN_ENABLED) and "Continue with
 * Apple" (APPLE_SIGN_IN_ENABLED) on /login and /signup.
 */
export const OAUTH_COPY = {
  google: 'Continue with Google',
  working: 'Opening Google…',
  /** Apple's own button label (Human Interface Guidelines: "Continue with Apple"). */
  apple: 'Continue with Apple',
  appleWorking: 'Opening Apple…',
  divider: 'or use your email',
  magicLink: 'Email me a sign-in link',
  magicLinkWorking: 'Sending the link…',
  magicLinkSent: 'Check your email for a sign-in link. It works even if you have not confirmed a password yet.',
  magicLinkHint: 'No password. We email you a link to sign in or create your account.',
  passwordOption: 'Or create a password',
  passwordOptionHide: 'Use a sign-in link instead',
  confirmReminder:
    'Confirm your email when you can. You can keep tracking claims and finish setup without waiting.',
  continueUnconfirmed: 'Keep going — I’ll confirm later',
  /** Shown next to the button on /login, where a new person can also create an account. */
  agreeLead: 'New here? Continuing with Google creates your free account, and you agree to the',
  agreeLeadApple: 'New here? Continuing with Apple creates your free account, and you agree to the',
  agreeLeadBoth: 'New here? Continuing with Google or Apple creates your free account, and you agree to the',
  /** Apple sign-in came back without signing the person in. */
  appleFailed: 'Apple sign-in didn’t finish. Try again, or use your email and password.',
  terms: 'Terms',
  and: 'and',
  privacy: 'Privacy Policy',
  /** Google sign-in came back without signing the person in (canceled, or Google said no). */
  failed: 'Google sign-in didn’t finish. Try again, or use your email and password.',
} as const;

/**
 * Dashboard value counter (DASHBOARD_VALUE_ENABLED). Every figure on this panel
 * is either a count of records on file for this member or an estimate that
 * prints its own assumption. Nothing here is a payout promise: potential comes
 * from listed settlement ranges, actual comes only from amounts the member
 * typed in themselves, and the two never merge into one headline.
 */
export const DASHBOARD_VALUE_COPY = {
  title: 'What your membership has done so far',
  intro:
    'Counts of what is on file for you, plus estimates that each state the assumption behind them. A potential figure is not money received, and Lawsuit AI does not confirm reported payouts with the administrator.',
  /** Prefix for every estimated figure's assumption line. */
  estimateWord: 'Estimate.',
  potentialLabel: 'Potential earnings (estimate)',
  potentialPrefix: 'Estimated',
  payoutCountLabel: 'Payouts you reported',
  payoutCountNote:
    'Each one is a payout you told us you received. Kept separate from the amount, because a report can arrive without a dollar amount.',
  payoutTotalLabel: 'Amount you reported receiving',
  payoutTotalNote:
    'The amounts you typed in, added up. Self-reported: Lawsuit AI does not check them with the administrator.',
  payoutNoAmount:
    'No amount recorded yet. You reported a payout without a dollar amount, so there is no total to show.',
  submittedLabel: 'Claims submitted',
  submittedNote:
    'Claims recorded as having reached an administrator. A claim marked submitted without a confirmation number is not counted.',
  timeSavedLabel: 'Estimated time saved',
  comparisonLabel: 'Estimated value vs membership',
  comparisonActualNote: 'What you reported receiving, measured against the assumed membership cost.',
  comparisonPotentialNote:
    'Measured from the listed potential ranges, not from money received: you have reported no payout amount yet.',
  comparisonNoStart:
    'We have no membership start date on file for you, so there is nothing to compare yet.',
  comparisonInTrial:
    'You are inside the free trial, so membership has cost you nothing so far and there is nothing to compare yet.',
  comparisonNothingToCompare:
    'No payout amount on file, and no match has a listed payout range, so there is nothing to compare yet.',
} as const;
