import { defineCopy } from './types';

/**
 * Settings, the details form, Legal and account deletion
 * (src/app/settings/page.tsx, src/components/NotificationPrefs.tsx,
 * src/components/DeleteAccount.tsx, src/components/ReferralCard.tsx and the
 * copy-ready address fields of src/components/claims/PrefillPacket.tsx), plus
 * the app-only rows of plan 3.3.
 */
export const settings = defineCopy({
  // Settings page (src/app/settings/page.tsx) --------------------------------
  intro: {
    text: 'Update your details, the answers we use to find settlements, and which emails you get.',
    source: 'src/app/settings/page.tsx',
  },
  yourDataTitle: {
    text: 'Your data',
    source: 'src/app/settings/page.tsx',
  },
  /** "{our} {privacyPolicy} {explainsWhatWeStore}[ {byEmailing} {email}]." */
  our: {
    text: 'Our',
    source: 'src/app/settings/page.tsx',
  },
  privacyPolicy: {
    text: 'Privacy Policy',
    source: 'src/app/settings/page.tsx',
  },
  explainsWhatWeStore: {
    text: 'explains what we store and why. You can ask us for a copy of your information, or ask us to delete your account',
    source: 'src/app/settings/page.tsx',
  },
  byEmailing: {
    text: 'by emailing',
    source: 'src/app/settings/page.tsx',
  },
  metricsNote: {
    text: 'Match-quality logging is optional. It never includes optional health answers.',
    source: 'src/app/settings/page.tsx',
  },
  /** The web says "You can turn it on or off in the form above." */
  metricsNoteWhere: {
    text: 'You can turn it on or off in Your details and emails.',
    source: 'src/app/settings/page.tsx',
    mobileOnly: true,
  },

  // Details form (src/components/NotificationPrefs.tsx) ----------------------
  detailsTitle: {
    text: 'Your details and emails',
    source: 'src/components/NotificationPrefs.tsx',
  },
  detailsIntro: {
    text: 'We keep these on your account. We never send them to settlement sites; you enter your own details when you file on the official site.',
    source: 'src/components/NotificationPrefs.tsx',
  },
  fullNameLabel: {
    text: 'Full name',
    source: 'src/components/NotificationPrefs.tsx',
  },
  fullNamePlaceholder: {
    text: 'Your legal name',
    source: 'src/components/NotificationPrefs.tsx',
  },
  stateLabel: {
    text: 'State',
    source: 'src/components/NotificationPrefs.tsx',
  },
  statePlaceholder: {
    text: 'Select a state',
    source: 'src/components/NotificationPrefs.tsx',
  },
  phoneLabel: {
    text: 'Phone number (optional)',
    source: 'src/components/NotificationPrefs.tsx',
  },
  phonePlaceholder: {
    text: '(555) 123-4567',
    source: 'src/components/NotificationPrefs.tsx',
  },
  /**
   * The web's hint starts with "We’ll only use this to help you fill in claim
   * forms, once that feature is ready." That feature has shipped (a claim's
   * copy-ready details show the phone), so the app keeps the second sentence.
   */
  phoneHint: {
    text: 'We don’t send text messages.',
    source: 'src/components/NotificationPrefs.tsx',
  },
  matchingTitle: {
    text: 'Settlements that may apply to you',
    source: 'src/components/NotificationPrefs.tsx',
  },
  matchingIntro: {
    text: 'These answers help us rank open settlements. You can change them anytime.',
    source: 'src/components/NotificationPrefs.tsx',
  },
  emailOptInLabel: {
    text: 'Email me about new settlements',
    source: 'src/components/NotificationPrefs.tsx',
  },
  emailOptInHint: {
    text: 'These emails are paused for now. Leave this on to get them when they restart. Account emails and important notices about your claims come either way.',
    source: 'src/components/NotificationPrefs.tsx',
  },
  metricsLabel: {
    text: 'Help improve matching (optional)',
    source: 'src/components/NotificationPrefs.tsx',
  },
  metricsHint: {
    text: 'If you turn this on, we log which suggestions you open, save, dismiss, or mark as submitted or paid. We store the score, rank, and non-health signals only. Optional health answers are never included.',
    source: 'src/components/NotificationPrefs.tsx',
  },
  saveChanges: {
    text: 'Save changes',
    source: 'src/components/NotificationPrefs.tsx',
  },
  saving: {
    text: 'Saving…',
    source: 'src/components/NotificationPrefs.tsx',
  },
  saved: {
    text: 'Saved',
    source: 'src/components/NotificationPrefs.tsx',
  },

  // Copy-ready address (src/components/claims/PrefillPacket.tsx) ------------
  addressLine1Label: {
    text: 'Address line 1',
    source: 'src/components/claims/PrefillPacket.tsx',
  },
  addressLine2Label: {
    text: 'Address line 2',
    source: 'src/components/claims/PrefillPacket.tsx',
  },
  cityLabel: {
    text: 'City',
    source: 'src/components/claims/PrefillPacket.tsx',
  },
  saveAddressConsent: {
    text: 'Save this address on my profile for future claims.',
    source: 'src/components/claims/PrefillPacket.tsx',
  },
  consentRequired: {
    text: 'Check the box to save these details for future claims.',
    source: 'src/components/claims/PrefillPacket.tsx',
  },

  // Share ClaimMatch (src/components/ReferralCard.tsx), without counts -------
  shareTitle: {
    text: 'Share ClaimMatch',
    source: 'src/components/ReferralCard.tsx',
  },
  shareBody: {
    text: 'Know someone who might qualify for a settlement? Send them your personal referral link.',
    source: 'src/components/ReferralCard.tsx',
  },
  shareNoLinkYet: {
    text: 'Your link will appear here once your account finishes setting up.',
    source: 'src/components/ReferralCard.tsx',
  },

  // Delete account (src/components/DeleteAccount.tsx) ------------------------
  deleteTitle: {
    text: 'Delete my account and data',
    source: 'src/components/DeleteAccount.tsx',
  },
  deleteBody: {
    text: 'This removes your profile, the answers we use to find settlements, claims, and payout notes. Type DELETE to confirm.',
    source: 'src/components/DeleteAccount.tsx',
  },
  deleteInputLabel: {
    text: 'Type DELETE to confirm',
    source: 'src/components/DeleteAccount.tsx',
  },
  deletePlaceholder: {
    text: 'DELETE',
    source: 'src/components/DeleteAccount.tsx',
  },
  deleting: {
    text: 'Deleting…',
    source: 'src/components/DeleteAccount.tsx',
  },

  // Rows and links ------------------------------------------------------------
  signOut: {
    text: 'Sign out',
    source: 'src/components/NavAuthLinks.tsx',
  },
  terms: {
    text: 'Terms',
    source: 'src/components/Footer.tsx',
  },
  howWeMakeMoney: {
    text: 'How we make money',
    source: 'src/components/Footer.tsx',
  },
  legalTitle: {
    text: 'Legal',
    source: 'plan 3.3 (/settings/legal)',
    mobileOnly: true,
  },

  // Deadline reminders (plan 3.3 and 5) --------------------------------------
  remindersLabel: {
    text: 'Deadline reminders',
    source: 'plan 3.3 (Settings: "Deadline reminders" toggle)',
    mobileOnly: true,
  },
  /** States which claims get one, without telling anyone to file (the web hedges: "If the official notice describes you…"). */
  remindersHint: {
    text: 'A reminder on this device 7 days and 1 day before each deadline, for claims you haven’t told us you filed.',
    source: 'plan 5 (Deadline reminders)',
    mobileOnly: true,
  },
  remindersDenied: {
    text: 'Notifications are turned off for ClaimMatch. To get deadline reminders, turn them on in Settings.',
    source: 'plan 3.3 (Settings: reminders permission)',
    mobileOnly: true,
  },
  openSystemSettings: {
    text: 'Open Settings',
    source: 'plan 3.3 (Settings: reminders permission)',
    mobileOnly: true,
  },
  remindersUnavailable: {
    text: 'Reminders aren’t available on this device.',
    source: 'plan 3.3 (Settings: reminders permission)',
    mobileOnly: true,
  },

  // App version ---------------------------------------------------------------
  /** "Version {version} ({build})" */
  version: {
    text: 'Version {version} ({build})',
    source: 'plan 3.3 (Settings: app version)',
    mobileOnly: true,
  },
});
