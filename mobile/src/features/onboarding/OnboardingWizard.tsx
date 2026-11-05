import { answersFromAttributes, type AttributeAnswers } from '@shared/lib/profile-attributes';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, View, type HostInstance } from 'react-native';

import { AppText, Button, Card, Notice, Screen, TextField } from '@/components/ui';
import { ArrowLeft, ArrowRight } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { onboarding, signedInAsText, stepOfTwoText } from '@/copy/onboarding';
import { userFacingError } from '@/data/errors';
import { useSaveSettings, type SettingsInput } from '@/data/profile';
import { MatchingQuestions, sameAnswers } from '@/features/settings/fields';
import { StatePickerField } from '@/features/shared';
import { space } from '@/theme/tokens';

import { onboardingDoneHref } from './hrefs';
import { OnboardingIntro } from './OnboardingIntro';

export interface OnboardingInitial {
  fullName: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface OnboardingWizardProps {
  initial: OnboardingInitial;
  /** The signed-in email, shown as "Signed in as …". */
  email: string | null;
  /** Checked path to continue to (the claim the person came from); else Your claims with the welcome card. */
  next: string | null;
  /** Shows "Email confirmed." (after an email link). */
  emailConfirmed: boolean;
}

/**
 * The two-step wizard of src/components/OnboardingWizard.tsx: name and state,
 * then the matcher questions (without the web's health section). "Save and
 * continue" posts name and state with onboarded:true to /api/settings, plus
 * the answers when they changed; "Skip for now" posts only onboarded:true, so
 * the dashboard stops asking. Both then close the modal onto `next` or
 * /dashboard?welcome=1.
 */
export function OnboardingWizard({ initial, email, next, emailConfirmed }: OnboardingWizardProps) {
  const router = useRouter();
  const save = useSaveSettings();
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState(initial.fullName);
  const [state, setState] = useState(initial.state);
  const [savedAnswers] = useState<AttributeAnswers>(() => answersFromAttributes(initial.attributes));
  const [answers, setAnswers] = useState<AttributeAnswers>(savedAnswers);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<null | 'save' | 'skip'>(null);
  const busy = action !== null;
  const headingRef = useRef<HostInstance>(null);
  const stepChanged = useRef(false);

  useEffect(() => {
    // After Continue or Back, screen readers start at the new step's heading.
    if (!stepChanged.current || !headingRef.current) return;
    AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus');
  }, [step]);

  function goTo(target: 1 | 2) {
    Keyboard.dismiss();
    stepChanged.current = true;
    setError(null);
    setStep(target);
  }

  async function run(kind: 'save' | 'skip') {
    if (busy) return;
    Keyboard.dismiss();
    setError(null);
    setAction(kind);
    // The answers go only when changed: sending them replaces every stored
    // answer, which would also clear a health answer saved on the web.
    const body: SettingsInput = kind === 'save' ? { full_name: fullName, state, onboarded: true } : { onboarded: true };
    if (kind === 'save' && !sameAnswers(answers, savedAnswers)) body.attributes = answers;
    try {
      await save.mutateAsync(body);
      // Stays busy until the modal closes, so a second tap cannot post again.
      router.dismissTo(onboardingDoneHref(next));
    } catch (caught) {
      setAction(null);
      setError(userFacingError(caught)?.message ?? common.genericError.text);
    }
  }

  const title = step === 1 ? onboarding.detailsTitle.text : onboarding.questionsTitle.text;
  const intro = step === 1 ? onboarding.detailsIntro.text : onboarding.questionsIntro.text;

  return (
    // A new Screen per step, so each step starts at the top.
    <Screen key={step} testID={`onboarding-step-${step}`}>
      {/* The web keeps its header above both steps; step 2 keeps its "never files for you" sentence (plan 5). */}
      {step === 1 ? (
        <OnboardingIntro emailConfirmed={emailConfirmed} />
      ) : (
        <AppText variant="body" color="textMuted" testID="onboarding-intro-short">
          {onboarding.intro.text}
        </AppText>
      )}
      <Card style={styles.card}>
        <View ref={headingRef} accessible accessibilityRole="header" accessibilityLabel={`${stepOfTwoText(step)}. ${title}`}>
          <AppText variant="badge" color="textMuted" style={styles.eyebrow}>
            {stepOfTwoText(step)}
          </AppText>
          <AppText variant="heading">{title}</AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {intro}
        </AppText>
        {step === 1 ? (
          <>
            <TextField
              label={onboarding.nameLabel.text}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
              maxLength={120}
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              disabled={busy}
              testID="onboarding-name"
            />
            <StatePickerField
              label={onboarding.stateLabel.text}
              value={state}
              onChange={setState}
              placeholder={onboarding.statePlaceholder.text}
              hint={onboarding.stateHelp.text}
              disabled={busy}
              testID="onboarding-state"
            />
            {email ? (
              <AppText variant="caption" color="textMuted">
                {signedInAsText(email)}
              </AppText>
            ) : null}
          </>
        ) : (
          <MatchingQuestions answers={answers} onChange={setAnswers} disabled={busy} testID="onboarding-questions" />
        )}
      </Card>

      {error ? <Notice tone="error" body={error} testID="onboarding-error" /> : null}

      <View style={styles.actions}>
        <Button
          label={action === 'save' ? onboarding.saving.text : step === 1 ? onboarding.continue.text : onboarding.saveAndContinue.text}
          icon={ArrowRight}
          iconPosition="trailing"
          loading={action === 'save'}
          disabled={busy}
          onPress={step === 1 ? () => goTo(2) : () => void run('save')}
          fullWidth
          testID="onboarding-primary"
        />
        <View style={styles.secondary}>
          {step === 2 ? (
            <Button label={onboarding.back.text} icon={ArrowLeft} variant="ghost" onPress={() => goTo(1)} disabled={busy} />
          ) : null}
          <Button
            label={onboarding.skipForNow.text}
            variant="ghost"
            loading={action === 'skip'}
            disabled={busy}
            onPress={() => void run('skip')}
            testID="onboarding-skip"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: space[1],
  },
  actions: {
    gap: space[2],
  },
  secondary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
