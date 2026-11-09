import { defineCopy } from './types';

/** App shell: tab labels, the update gate, the configuration error and not-found. */
export const app = defineCopy({
  appName: {
    text: 'ClaimMatch',
    source: 'src/components/SiteLogo.tsx',
  },
  tabSettlements: {
    text: 'Settlements',
    source: 'src/components/NavMenu.tsx',
  },
  tabYourClaims: {
    text: 'Your claims',
    source: 'src/app/dashboard/page.tsx',
  },
  tabSettings: {
    text: 'Settings',
    source: 'src/app/settings/page.tsx',
  },

  updateRequiredTitle: {
    text: 'Update ClaimMatch',
    source: 'plan 3.2 (minBuild update gate)',
    mobileOnly: true,
  },
  updateRequiredBodyIos: {
    text: 'This version of ClaimMatch is no longer supported. Get the latest version from the App Store, then open the app again.',
    source: 'plan 3.2 (minBuild update gate)',
    mobileOnly: true,
  },
  updateRequiredBodyAndroid: {
    text: 'This version of ClaimMatch is no longer supported. Get the latest version from Google Play, then open the app again.',
    source: 'plan 3.2 (minBuild update gate)',
    mobileOnly: true,
  },
  updateRequiredSafe: {
    text: 'Your claims are safe.',
    source: 'src/app/dashboard/error.tsx',
  },

  configErrorTitle: {
    text: 'This build is missing its settings',
    source: 'plan 4 (environment)',
    mobileOnly: true,
  },
  configErrorBody: {
    text: 'ClaimMatch needs these values to start. Add them to mobile/.env.local (see .env.example) or to the EAS environment, then rebuild the app.',
    source: 'plan 4 (environment)',
    mobileOnly: true,
  },
  configErrorMissing: {
    text: 'Missing',
    source: 'plan 4 (environment)',
    mobileOnly: true,
  },
  configErrorInvalid: {
    text: 'Not a valid URL',
    source: 'plan 4 (environment)',
    mobileOnly: true,
  },

  notFoundTitle: {
    text: 'We couldn’t find that page',
    source: 'src/app/not-found.tsx',
  },
  notFoundBody: {
    text: 'The link may be wrong, or the page may have moved. If you were looking for a settlement, it may have closed or been taken down.',
    source: 'src/app/not-found.tsx',
  },
  browseOpenSettlements: {
    text: 'Browse open settlements',
    source: 'src/app/not-found.tsx',
  },
});
