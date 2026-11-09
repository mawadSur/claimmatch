import { defineCopy } from './types';

/**
 * Log in, sign up, check-email, forgot and reset password, and the email-link
 * screens (plan 3.3 Auth and section 4). Text cut around a value, a number or
 * a link is kept as fragments that each appear verbatim in the web source;
 * the screens join them with single spaces.
 */
export const auth = defineCopy({
  // AuthForm (src/components/AuthForm.tsx) ----------------------------------
  fullNameLabel: {
    text: 'Full name',
    source: 'src/components/AuthForm.tsx',
  },
  fullNamePlaceholder: {
    text: 'Jane Doe',
    source: 'src/components/AuthForm.tsx',
  },
  emailLabel: {
    text: 'Email address',
    source: 'src/components/AuthForm.tsx',
  },
  emailPlaceholder: {
    text: 'you@email.com',
    source: 'src/components/AuthForm.tsx',
  },
  passwordLabel: {
    text: 'Password',
    source: 'src/components/AuthForm.tsx',
  },
  passwordPlaceholder: {
    text: 'Your password',
    source: 'src/components/AuthForm.tsx',
  },
  /** "{atLeast} 10 {characters}", the new-password placeholder. */
  atLeast: {
    text: 'At least',
    source: 'src/components/AuthForm.tsx',
  },
  characters: {
    text: 'characters',
    source: 'src/components/AuthForm.tsx',
  },
  /** "{useAtLeast} 10 {charactersForYourPassword}", AuthForm's signup check (validateSignupFields). */
  useAtLeast: {
    text: 'Use at least',
    source: 'src/lib/signup-validation.ts',
  },
  charactersForYourPassword: {
    text: 'characters for your password.',
    source: 'src/lib/signup-validation.ts',
  },
  forgotPasswordLink: {
    text: 'Forgot password?',
    source: 'src/components/AuthForm.tsx',
  },
  signingIn: {
    text: 'Signing in…',
    source: 'src/components/AuthForm.tsx',
  },
  createMyAccount: {
    text: 'Create my account',
    source: 'src/components/AuthForm.tsx',
  },
  creatingAccount: {
    text: 'Creating your account…',
    source: 'src/components/AuthForm.tsx',
  },
  alreadyHaveAccount: {
    text: 'Already have an account?',
    source: 'src/components/AuthForm.tsx',
  },
  createAnAccount: {
    text: 'Create an account',
    source: 'src/components/AuthForm.tsx',
  },
  timeout: {
    text: 'This is taking too long. Check your connection and try again.',
    source: 'src/components/AuthForm.tsx',
  },
  /** "{emailConfirmed}[ {toYourClaim}]." on the log-in screen after a confirmation link. */
  emailConfirmed: {
    text: 'Your email is confirmed. Log in to continue',
    source: 'src/components/AuthForm.tsx',
  },
  toYourClaim: {
    text: 'to your claim',
    source: 'src/components/AuthForm.tsx',
  },
  confirmLinkExpired: {
    text: 'That confirmation link has expired or was already used. If you already confirmed your email, log in below. If not, create your account again with the same email to get a new link.',
    source: 'src/components/AuthForm.tsx',
  },

  // Check your email (AuthForm's check-email state) ---------------------------
  checkEmailTitle: {
    text: 'Check your email',
    source: 'src/components/AuthForm.tsx',
  },
  /** "{sentConfirmationTo} {email}. {openItToVerify}" */
  sentConfirmationTo: {
    text: 'We sent a confirmation link to',
    source: 'src/components/AuthForm.tsx',
  },
  /** The web says "Click it…". */
  openItToVerify: {
    text: 'Open it to verify your account and finish setting up your profile.',
    source: 'src/components/AuthForm.tsx',
    mobileOnly: true,
  },
  /** "{didntGetIt}" then the link {tryDifferentEmail}. */
  didntGetIt: {
    text: 'Didn’t get it? Check your spam folder, or',
    source: 'src/components/AuthForm.tsx',
  },
  tryDifferentEmail: {
    text: 'try a different email',
    source: 'src/components/AuthForm.tsx',
  },
  backToApp: {
    text: 'When you’re done, come back to ClaimMatch and log in.',
    source: 'plan 3.3 (Auth: app-only line on the check-email and reset screens)',
    mobileOnly: true,
  },

  // Sign-up page (src/app/signup/page.tsx) -----------------------------------
  signupTitle: {
    text: 'Create your free account',
    source: 'src/app/signup/page.tsx',
  },
  signupIntro: {
    text: 'Keep track of the settlement claims you file, all in one place. You always file on the official settlement website yourself.',
    source: 'src/app/signup/page.tsx',
  },
  /**
   * Replaces the web's "Free during beta. We may introduce a fee later."
   * (src/app/signup/page.tsx): App Review rejects beta wording in a store app
   * (Guideline 2.2).
   */
  bulletFreeForNow: {
    text: 'Free for now. We may introduce a fee later.',
    source: 'src/app/signup/page.tsx',
    mobileOnly: true,
  },
  bulletOfficialFilingFree: {
    text: 'Official filing on the administrator’s site stays free.',
    source: 'src/app/signup/page.tsx',
  },
  bulletBrowse: {
    text: 'Browse settlements that are open for claims.',
    source: 'src/app/signup/page.tsx',
  },
  bulletKeepTrack: {
    text: 'Keep track of the claims you file on official sites.',
    source: 'src/app/signup/page.tsx',
  },
  /** "{agreeLead} {terms} {and} {privacyPolicy}." */
  agreeLead: {
    text: 'By creating an account, you agree to the',
    source: 'src/app/signup/page.tsx',
  },
  terms: {
    text: 'Terms',
    source: 'src/app/signup/page.tsx',
  },
  and: {
    text: 'and',
    source: 'src/app/signup/page.tsx',
  },
  privacyPolicy: {
    text: 'Privacy Policy',
    source: 'src/app/signup/page.tsx',
  },

  // Forgot password (src/app/forgot-password/page.tsx, ForgotPasswordForm) ----
  forgotTitle: {
    text: 'Forgot your password?',
    source: 'src/app/forgot-password/page.tsx',
  },
  forgotIntro: {
    text: 'Enter your email and we’ll send you a link to choose a new one.',
    source: 'src/app/forgot-password/page.tsx',
  },
  backToLogIn: {
    text: 'Back to log in',
    source: 'src/app/forgot-password/page.tsx',
  },
  enterSignUpEmail: {
    text: 'Enter the email address you signed up with.',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  tooManyRequests: {
    text: 'Too many requests. Wait a minute and try again.',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  checkConnection: {
    text: 'Something went wrong. Check your connection and try again.',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  resetLinkExpired: {
    text: 'That reset link has expired or was already used. Request a new one below.',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  emailResetLink: {
    text: 'Email me a reset link',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  /** "{ifAnAccountUses} {email}{weSentResetLink}" */
  ifAnAccountUses: {
    text: 'If an account uses',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },
  weSentResetLink: {
    text: ', we sent it a link to reset your password.',
    source: 'src/components/auth/ForgotPasswordForm.tsx',
  },

  // On-device checks ---------------------------------------------------------
  /** AuthForm's signup checks (validateSignupFields), in its order: first an empty name. */
  enterYourName: {
    text: 'Enter your name.',
    source: 'src/lib/signup-validation.ts',
  },
  /** Then an empty email, then one that is not shaped like an address. */
  enterYourEmail: {
    text: 'Enter your email address.',
    source: 'src/lib/signup-validation.ts',
  },
  enterValidEmail: {
    text: 'Enter a valid email address.',
    source: 'src/lib/signup-validation.ts',
  },
  /** validateSignupFields for an empty password; a short one gets passwordTooShortText. */
  enterAPassword: {
    text: 'Enter a password.',
    source: 'src/lib/signup-validation.ts',
  },
  /** No web text: the web login form sends an empty password to Supabase. */
  enterYourPassword: {
    text: 'Enter your password.',
    source: 'plan 3.3 (Auth: errors next to fields)',
    mobileOnly: true,
  },

  // Reset password (src/app/reset-password/page.tsx, ResetPasswordForm) -----
  resetTitle: {
    text: 'Choose a new password',
    source: 'src/app/reset-password/page.tsx',
  },
  resetIntro: {
    text: 'You’ll use it the next time you log in.',
    source: 'src/app/reset-password/page.tsx',
  },
  newPasswordLabel: {
    text: 'New password',
    source: 'src/components/auth/ResetPasswordForm.tsx',
  },
  confirmPasswordLabel: {
    text: 'Confirm new password',
    source: 'src/components/auth/ResetPasswordForm.tsx',
  },
  passwordsDontMatch: {
    text: 'The two passwords don’t match.',
    source: 'src/components/auth/ResetPasswordForm.tsx',
  },
  updatePasswordFailed: {
    text: 'We couldn’t update your password. Request a new reset link and try again.',
    source: 'src/components/auth/ResetPasswordForm.tsx',
  },
  saveNewPassword: {
    text: 'Save new password',
    source: 'src/components/auth/ResetPasswordForm.tsx',
  },

  // Email links (src/app/auth/confirm/page.tsx), M8 ------------------------
  linkIncompleteTitle: {
    text: 'This link isn’t complete',
    source: 'src/app/auth/confirm/page.tsx',
  },
  linkIncompleteBody: {
    text: 'Open the link from your email again, or request a new one.',
    source: 'src/app/auth/confirm/page.tsx',
  },
  requestNewResetLink: {
    text: 'Request a new reset link',
    source: 'src/app/auth/confirm/page.tsx',
  },
  goToLogIn: {
    text: 'Go to log in',
    source: 'src/app/auth/confirm/page.tsx',
  },
  resetYourPassword: {
    text: 'Reset your password',
    source: 'src/app/auth/confirm/page.tsx',
  },
  confirmYourEmail: {
    text: 'Confirm your email',
    source: 'src/app/auth/confirm/page.tsx',
  },
  pressToReset: {
    text: 'Press the button to continue and choose a new password.',
    source: 'src/app/auth/confirm/page.tsx',
  },
  pressToConfirm: {
    text: 'Press the button to confirm your email and finish setting up your account.',
    source: 'src/app/auth/confirm/page.tsx',
  },
  continueToReset: {
    text: 'Continue to reset password',
    source: 'src/app/auth/confirm/page.tsx',
  },
  confirmMyEmail: {
    text: 'Confirm my email',
    source: 'src/app/auth/confirm/page.tsx',
  },
});

/** "Use at least 10 characters for your password." */
export function passwordTooShortText(min: number): string {
  return `${auth.useAtLeast.text} ${min} ${auth.charactersForYourPassword.text}`;
}

/** "At least 10 characters" */
export function newPasswordPlaceholder(min: number): string {
  return `${auth.atLeast.text} ${min} ${auth.characters.text}`;
}
