import type { ClaimGroup } from '@shared/lib/claims';

import { defineCopy } from './types';

/**
 * The "Your claims" tab (plan 3.3), verbatim from src/app/dashboard/*,
 * src/components/claims/YourMatches.tsx, ClaimList.tsx and ClosingSoon.tsx.
 * The corrective notice copy lives in ./notices. Text cut around a count, a
 * name or a link is kept as fragments that each appear verbatim in the web
 * source; the helpers below join them.
 */
export const dashboard = defineCopy({
  // Header (src/app/dashboard/page.tsx) -------------------------------------
  title: {
    text: 'Your claims',
    source: 'src/app/dashboard/page.tsx',
  },
  /** The web's `Hi, ${firstName}.` as a template. */
  greeting: {
    text: 'Hi, {firstName}.',
    source: 'src/app/dashboard/page.tsx',
    mobileOnly: true,
  },
  /** "{introLead} {introFeeOn | introFeeOff} {introTail}" */
  introLead: {
    text: 'Track the claims you file on official settlement sites.',
    source: 'src/app/dashboard/page.tsx',
  },
  /** FEE_DISCLOSURE_ENABLED on. */
  introFeeOn: {
    text: 'Official filing stays free.',
    source: 'src/app/dashboard/page.tsx',
  },
  /**
   * Replaces the web's "ClaimMatch is free during beta." (src/app/dashboard/page.tsx):
   * App Review rejects beta wording in a store app (Guideline 2.2).
   */
  introFeeOff: {
    text: 'ClaimMatch is free for now.',
    source: 'src/app/dashboard/page.tsx',
    mobileOnly: true,
  },
  introTail: {
    text: 'It doesn’t file for you and never handles settlement payments.',
    source: 'src/app/dashboard/page.tsx',
  },

  // Banners (?denied=admin, ?password=updated) -------------------------------
  deniedAdmin: {
    text: 'You don’t have access to the admin area. It’s only for ClaimMatch staff.',
    source: 'src/app/dashboard/page.tsx',
  },
  passwordUpdated: {
    text: 'Your password was updated.',
    source: 'src/app/dashboard/page.tsx',
  },

  // WelcomeCard (?welcome=1, after onboarding) -------------------------------
  welcomeTitle: {
    text: 'You’re all set',
    source: 'src/app/dashboard/page.tsx',
  },
  welcomeIntro: {
    text: 'Here’s how ClaimMatch works:',
    source: 'src/app/dashboard/page.tsx',
  },
  welcomeStep1: {
    text: 'Find an open settlement in our list.',
    source: 'src/app/dashboard/page.tsx',
  },
  welcomeStep2: {
    text: 'Read the official notice to see if you qualify.',
    source: 'src/app/dashboard/page.tsx',
  },
  welcomeStep3: {
    text: 'File on the official site. It’s free, and you do it yourself.',
    source: 'src/app/dashboard/page.tsx',
  },
  welcomeStep4: {
    text: 'Come back and tell us you filed. We keep your deadline and confirmation number in one place.',
    source: 'src/app/dashboard/page.tsx',
  },

  // "Finish your profile" (profile not onboarded) ----------------------------
  finishProfileTitle: {
    text: 'Finish your profile',
    source: 'src/app/dashboard/page.tsx',
  },
  finishProfileBody: {
    text: 'Add your name, state, and a few optional details (vehicles, accounts, shopping). We use those to find settlements that may apply to you.',
    source: 'src/app/dashboard/page.tsx',
  },
  finishProfileAction: {
    text: 'Finish profile',
    source: 'src/app/dashboard/page.tsx',
  },

  // Your matches (src/components/claims/YourMatches.tsx) ---------------------
  matchesTitle: {
    text: 'Your matches',
    source: 'src/components/claims/YourMatches.tsx',
  },
  matchesIntro: {
    text: 'Settlements that may apply to you. A strong match passed the listing’s stated rules. A possible match is a state-only or broader fit. Always check the official notice before you file.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  editProfile: {
    text: 'Edit profile',
    source: 'src/components/claims/YourMatches.tsx',
  },
  matchesFailedTitle: {
    text: 'We couldn’t load matches right now.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  matchesFailedBody: {
    text: 'Please try again in a minute.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  strongMatches: {
    text: 'Strong matches',
    source: 'src/components/claims/YourMatches.tsx',
  },
  noStrongMatches: {
    text: 'No strong matches yet. We only label a match strong when the listing has structured who-qualifies rules that fit your profile. Possible matches below are a broader fit — check the official notice on each one.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  /** "{possibleMatches} ({count}[, {hidden} {moreNotShown}])" */
  possibleMatches: {
    text: 'Possible matches',
    source: 'src/components/claims/YourMatches.tsx',
  },
  moreNotShown: {
    text: 'more not shown',
    source: 'src/components/claims/YourMatches.tsx',
  },
  showOrHide: {
    text: 'Show or hide',
    source: 'src/components/claims/YourMatches.tsx',
  },
  /** Followed by " {POSSIBLE_MATCH_CAP}." */
  possibleIntro: {
    text: 'These are state-only or broader fits. Showing up to',
    source: 'src/components/claims/YourMatches.tsx',
  },
  addProfileDetailsTitle: {
    text: 'Add a few profile details',
    source: 'src/components/claims/YourMatches.tsx',
  },
  addProfileDetailsBody: {
    text: 'Tell us about vehicles, bank or credit accounts, shopping, streaming, or a data-breach notice. We use those answers to find settlements that may apply to you.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  noOpenMatchesTitle: {
    text: 'No open matches right now',
    source: 'src/components/claims/YourMatches.tsx',
  },
  noOpenMatchesBody: {
    text: 'Nothing open matches your profile today. You can add more details or browse the full list.',
    source: 'src/components/claims/YourMatches.tsx',
  },
  finishYourProfile: {
    text: 'Finish your profile',
    source: 'src/components/claims/YourMatches.tsx',
  },
  updateYourProfile: {
    text: 'Update your profile',
    source: 'src/components/claims/YourMatches.tsx',
  },
  howToFile: {
    text: 'How to file',
    source: 'src/components/claims/YourMatches.tsx',
  },
  /** Screen-reader name of a row's button: the web's aria-label `${label}: ${title}`. */
  actionFor: {
    text: '{label}: {title}',
    source: 'src/components/claims/ClaimList.tsx',
    mobileOnly: true,
  },

  // Your claims (src/components/claims/ClaimList.tsx) ------------------------
  claimsTitle: {
    text: 'Your claims',
    source: 'src/app/dashboard/page.tsx',
  },
  claimsIntro: {
    text: 'Grouped by what to do next. Check each official site for the exact deadline time.',
    source: 'src/app/dashboard/page.tsx',
  },
  claimsFailedTitle: {
    text: 'We couldn’t load your claims right now.',
    source: 'src/app/dashboard/page.tsx',
  },
  /** The web says "Please refresh the page in a minute." (plan 3.2, rule 1); the app adds a "Try again" button. */
  claimsFailedBody: {
    text: 'Please try again in a minute.',
    source: 'src/app/dashboard/page.tsx',
    mobileOnly: true,
  },
  hintNeedsFiling: {
    text: 'If the official notice describes you, file on the official site before the deadline.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  hintReported: {
    text: 'You told us you filed. Add the confirmation number when you get it.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  hintSubmitted: {
    text: 'Filed, with the administrator’s confirmation number on record.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  hintClosed: {
    text: 'The deadline passed, or there is nothing left to do.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  hintOther: {
    text: 'We can’t show these right now.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  noClaimsTitle: {
    text: 'You’re not tracking any claims yet',
    source: 'src/components/claims/ClaimList.tsx',
  },
  noClaimsBody: {
    text: 'Find an open settlement, check the official notice to see if it applies to you, and file on the official site. Then tell us you filed, and your claim shows up here with its deadline and confirmation number.',
    source: 'src/components/claims/ClaimList.tsx',
  },
  /** A row whose settlement could not be read, as the server words it (matched exactly, never shown). */
  detailsUnavailableWeb: {
    text: "We couldn't load this settlement's details. Refresh the page in a minute.",
    source: 'src/components/claims/dashboard-model.ts',
  },
  /** detailsUnavailableWeb, without "Refresh the page" (plan 3.2, rule 1). */
  detailsUnavailable: {
    text: "We couldn't load this settlement's details. Pull down to refresh in a minute.",
    source: 'src/components/claims/dashboard-model.ts',
    mobileOnly: true,
  },

  // Closing soon (src/components/claims/ClosingSoon.tsx) ---------------------
  closingSoonTitle: {
    text: 'Closing soon',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  closingSoonIntro: {
    text: 'Open settlements in our list with the nearest deadlines. This is not a list of matches: read each official notice to see if it applies to you.',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  browseAllSettlements: {
    text: 'Browse all settlements',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  closingSoonFailedTitle: {
    text: 'We couldn’t load settlements right now.',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  /** Followed by the link {goToAllSettlements}. */
  closingSoonFailedBody: {
    text: 'Please try again in a minute, or',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  goToAllSettlements: {
    text: 'go to all settlements',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  /** Followed by the link {browseAllOpenSettlements}. */
  noDeadlinesSoon: {
    text: 'No deadlines are coming up in our list right now.',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  browseAllOpenSettlements: {
    text: 'Browse all open settlements',
    source: 'src/components/claims/ClosingSoon.tsx',
  },
  officialSite: {
    text: 'Official site',
    source: 'src/components/claims/ClosingSoon.tsx',
  },

  // Loading and whole-screen error (loading.tsx, error.tsx) ------------------
  loading: {
    text: 'Loading your claims…',
    source: 'src/app/dashboard/loading.tsx',
  },
  errorTitle: {
    text: 'We couldn’t load your claims',
    source: 'src/app/dashboard/error.tsx',
  },
  errorBody: {
    text: 'This is on our side, not yours. Your claims are safe. Please try again in a minute.',
    source: 'src/app/dashboard/error.tsx',
  },
  browseSettlements: {
    text: 'Browse settlements',
    source: 'src/app/dashboard/error.tsx',
  },
});

/** The hint beside each group of claims (ClaimList GROUP_HINT). */
export function groupHint(group: ClaimGroup): string {
  switch (group) {
    case 'needs_filing':
      return dashboard.hintNeedsFiling.text;
    case 'reported':
      return dashboard.hintReported.text;
    case 'submitted':
      return dashboard.hintSubmitted.text;
    case 'closed':
      return dashboard.hintClosed.text;
    case 'other':
      return dashboard.hintOther.text;
  }
}

/** The header sentence, worded for FEE_DISCLOSURE_ENABLED. */
export function introSentence(feeDisclosure: boolean): string {
  const fee = feeDisclosure ? dashboard.introFeeOn.text : dashboard.introFeeOff.text;
  return `${dashboard.introLead.text} ${fee} ${dashboard.introTail.text}`;
}

/** "Possible matches (20, 4 more not shown)". */
export function possibleMatchesSummary(count: number, hidden: number): string {
  const more = hidden > 0 ? `, ${hidden} ${dashboard.moreNotShown.text}` : '';
  return `${dashboard.possibleMatches.text} (${count}${more})`;
}

/** "These are state-only or broader fits. Showing up to 20." */
export function possibleIntro(cap: number): string {
  return `${dashboard.possibleIntro.text} ${cap}.`;
}

/** A row's next step, without the web's "Refresh the page". */
export function nextStepText(text: string): string {
  return text === dashboard.detailsUnavailableWeb.text ? dashboard.detailsUnavailable.text : text;
}
