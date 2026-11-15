import { defineCopy } from './types';

/**
 * Onboarding (src/app/onboarding/page.tsx, src/components/OnboardingWizard.tsx)
 * and the matching questions shared with Settings
 * (src/components/ProfileAttributesFields.tsx, without its health section).
 * The question labels and help come from MATCHER_QUESTIONS in
 * @shared/lib/profile-attributes.
 */
export const onboarding = defineCopy({
  // Header (src/app/onboarding/page.tsx) -------------------------------------
  aboutOneMinute: {
    text: 'About 1 minute',
    source: 'src/app/onboarding/page.tsx',
  },
  title: {
    text: 'Welcome to Lawsuit AI',
    source: 'src/app/onboarding/page.tsx',
  },
  /** "{intro} {howItWorks}" above the steps; step 2 repeats {intro} alone (plan 5). */
  intro: {
    text: 'Lawsuit AI is a free claim assistant. It never files for you and never handles settlement payments.',
    source: 'src/app/onboarding/page.tsx',
  },
  howItWorks: {
    text: 'Here’s how it works:',
    source: 'src/app/onboarding/page.tsx',
  },
  howStep1: {
    text: 'Find an open settlement in our list.',
    source: 'src/app/onboarding/page.tsx',
  },
  howStep2: {
    text: 'Read the official notice to see if you qualify.',
    source: 'src/app/onboarding/page.tsx',
  },
  howStep3: {
    text: 'File on the official site. It’s free, and you do it yourself.',
    source: 'src/app/onboarding/page.tsx',
  },
  howStep4: {
    text: 'Tell us you filed. We keep your deadline and confirmation number in one place.',
    source: 'src/app/onboarding/page.tsx',
  },
  /** Bold lead, then {emailConfirmedBody}. */
  emailConfirmed: {
    text: 'Email confirmed.',
    source: 'src/app/onboarding/page.tsx',
  },
  emailConfirmedBody: {
    text: 'Finish a couple of optional details so we can find settlements that may apply to you.',
    source: 'src/app/onboarding/page.tsx',
  },

  // Wizard (src/components/OnboardingWizard.tsx) -----------------------------
  /** "{step} 1 {of} 2": the web counts its steps ("Step {step} of {lastStep}"); the app has 2. */
  step: {
    text: 'Step',
    source: 'src/components/OnboardingWizard.tsx',
  },
  of: {
    text: 'of',
    source: 'src/components/OnboardingWizard.tsx',
  },
  detailsTitle: {
    text: 'Your details',
    source: 'src/components/OnboardingWizard.tsx',
  },
  detailsIntro: {
    text: 'All optional. Next we’ll ask a few short questions so we can find settlements that may apply to you.',
    source: 'src/components/OnboardingWizard.tsx',
  },
  nameLabel: {
    text: 'Your name',
    source: 'src/components/OnboardingWizard.tsx',
  },
  stateLabel: {
    text: 'State you live in',
    source: 'src/components/OnboardingWizard.tsx',
  },
  statePlaceholder: {
    text: 'Choose your state…',
    source: 'src/components/OnboardingWizard.tsx',
  },
  stateHelp: {
    text: 'Some settlements are only for people in certain states.',
    source: 'src/components/OnboardingWizard.tsx',
  },
  /** "{signedInAs} {email}." */
  signedInAs: {
    text: 'Signed in as',
    source: 'src/components/OnboardingWizard.tsx',
  },
  questionsTitle: {
    text: 'A few things that help us match you',
    source: 'src/components/OnboardingWizard.tsx',
  },
  questionsIntro: {
    text: 'Vehicles, accounts, shopping, streaming, work — whatever applies. You can edit these anytime in Settings.',
    source: 'src/components/OnboardingWizard.tsx',
  },
  back: {
    text: 'Back',
    source: 'src/components/OnboardingWizard.tsx',
  },
  continue: {
    text: 'Continue',
    source: 'src/components/OnboardingWizard.tsx',
  },
  saveAndContinue: {
    text: 'Save and continue',
    source: 'src/components/OnboardingWizard.tsx',
  },
  saving: {
    text: 'Saving…',
    source: 'src/components/OnboardingWizard.tsx',
  },
  skipForNow: {
    text: 'Skip for now',
    source: 'src/components/OnboardingWizard.tsx',
  },

  // Matching questions (src/components/ProfileAttributesFields.tsx) ---------
  whichSoundLikeYou: {
    text: 'Which of these sound like you?',
    source: 'src/components/ProfileAttributesFields.tsx',
  },
  checkAnyThatApply: {
    text: 'Check any that apply. You can skip a question or change this later in Settings.',
    source: 'src/components/ProfileAttributesFields.tsx',
  },
  whichBrands: {
    text: 'Which brands?',
    source: 'src/components/ProfileAttributesFields.tsx',
  },
});

/** The app's onboarding steps (the web adds a third, profile facts, when PROFILE_V2_ENABLED=1). */
const ONBOARDING_STEPS = 2;

/** "Step 1 of 2" */
export function stepOfTwoText(step: 1 | 2): string {
  return `${onboarding.step.text} ${step} ${onboarding.of.text} ${ONBOARDING_STEPS}`;
}

/** "Signed in as {email}." */
export function signedInAsText(email: string): string {
  return `${onboarding.signedInAs.text} ${email}.`;
}
