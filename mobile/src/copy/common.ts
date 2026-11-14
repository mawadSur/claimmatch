import { defineCopy } from './types';

/** Copy shared across screens: errors, retry, the unverified notice. */
export const common = defineCopy({
  networkError: {
    text: "We couldn't reach Lawsuit AI. Check your internet connection and try again.",
    source: 'src/components/claims/claim-api.ts',
  },
  loggedOut: {
    text: 'You were logged out.',
    source: 'src/components/claims/claim-api.ts',
  },
  genericError: {
    text: 'Something went wrong. Please try again.',
    source: 'src/components/claims/claim-api.ts',
  },
  /** Server code `claim_changed`; the web text says "Refresh the page and try again." */
  claimChanged: {
    text: 'This claim just changed, maybe on another device. Pull down to refresh, then try again.',
    source: 'src/lib/claim-input.ts',
    mobileOnly: true,
  },
  /** Server code `not_allowed`; the web text says "Refresh the page and try again." */
  notAllowed: {
    text: "That change isn't possible for this claim. Pull down to refresh, then try again.",
    source: 'src/lib/claims.ts',
    mobileOnly: true,
  },
  tryAgain: {
    text: 'Try again',
    source: 'src/app/lawsuits/error.tsx',
  },
  loadErrorTitle: {
    text: 'We couldn’t load this screen',
    source: 'src/app/lawsuits/error.tsx',
    mobileOnly: true,
  },
  loadErrorBody: {
    text: 'This is on our side, not yours. Please try again in a minute.',
    source: 'src/app/lawsuits/error.tsx',
  },
  unverifiedLabel: {
    text: 'Unverified: check the official site',
    source: 'src/components/claims/UnverifiedLabel.tsx',
  },
  unverifiedNoticeBody: {
    text: 'These listings come from public sources, and we haven’t checked them against the official notices yet. Each one links to the official site, or to where we found it. Confirm the details there before you file.',
    source: 'src/app/lawsuits/page.tsx',
  },
  logIn: {
    text: 'Log in',
    source: 'src/components/NavAuthLinks.tsx',
  },
  close: {
    text: 'Close',
    source: 'plan 3.1 (modal screens)',
    mobileOnly: true,
  },
  loading: {
    text: 'Loading',
    source: 'plan 3.3 (loading states)',
    mobileOnly: true,
  },
  /** Never "inside Lawsuit AI": official sites and forms are not Lawsuit AI's. */
  opensInBrowserHint: {
    text: 'Opens in a browser.',
    source: 'plan 3.3 (in-app browser)',
    mobileOnly: true,
  },
  showPassword: {
    text: 'Show password',
    source: 'plan 3.3 (Auth: show and hide the password)',
    mobileOnly: true,
  },
  hidePassword: {
    text: 'Hide password',
    source: 'plan 3.3 (Auth: show and hide the password)',
    mobileOnly: true,
  },
});
