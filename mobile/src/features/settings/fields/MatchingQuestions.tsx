import { MATCHER_QUESTIONS, type AttributeAnswers } from '@shared/lib/profile-attributes';
import { StyleSheet, View } from 'react-native';

import { AppText, CheckboxRow, Chip } from '@/components/ui';
import { onboarding } from '@/copy/onboarding';
import { space } from '@/theme/tokens';

const BOOLEAN_QUESTIONS = MATCHER_QUESTIONS.filter((question) => question.type === 'boolean');
const VEHICLE_BRANDS = MATCHER_QUESTIONS.find((question) => question.key === 'vehicle_brands')?.options ?? [];

/** The brands chosen so far (an array of strings, or none). */
function brandsOf(answers: AttributeAnswers): string[] {
  const value = answers.vehicle_brands;
  return Array.isArray(value) ? value : [];
}

/** Sets one yes/no answer; "no" to owning a vehicle also clears the brands. */
export function setBooleanAnswer(answers: AttributeAnswers, key: string, value: boolean): AttributeAnswers {
  const next: AttributeAnswers = { ...answers, [key]: value };
  if (key === 'owns_vehicle' && !value) next.vehicle_brands = [];
  return next;
}

/** Turns one brand on or off; choosing a brand also answers "yes" to owning a vehicle. */
export function toggleBrandAnswer(answers: AttributeAnswers, brand: string): AttributeAnswers {
  const current = brandsOf(answers);
  const next = current.includes(brand) ? current.filter((item) => item !== brand) : [...current, brand];
  return { ...answers, owns_vehicle: true, vehicle_brands: next };
}

/**
 * Whether two sets of matching answers look the same on screen: every
 * checkbox is checked in both or in neither (unanswered and "no" are both
 * unchecked), and every list holds the same choices, in any order. Saves
 * send `attributes` only when they differ, because the server replaces every
 * managed answer with the ones it gets, which also clears a health answer
 * saved on the web (src/lib/profile-attributes.ts applyAttributePatch).
 */
export function sameAnswers(a: AttributeAnswers, b: AttributeAnswers): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      const one = new Set(Array.isArray(left) ? left : []);
      const other = new Set(Array.isArray(right) ? right : []);
      if (one.size !== other.size || [...one].some((item) => !other.has(item))) return false;
    } else if ((left === true) !== (right === true)) {
      return false;
    }
  }
  return true;
}

export interface MatchingQuestionsProps {
  answers: AttributeAnswers;
  onChange: (next: AttributeAnswers) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The matcher questions from src/components/ProfileAttributesFields.tsx, used
 * by onboarding and Settings, in the web's order: the yes/no questions, then
 * the brands once "owns a vehicle" is checked. The web's optional health
 * section is left out: the app never asks for health data (plan 5).
 */
export function MatchingQuestions({ answers, onChange, disabled = false, testID }: MatchingQuestionsProps) {
  const ownsVehicle = answers.owns_vehicle === true;
  const brands = brandsOf(answers);

  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.intro}>
        <AppText variant="label" accessibilityRole="header">
          {onboarding.whichSoundLikeYou.text}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {onboarding.checkAnyThatApply.text}
        </AppText>
      </View>
      {BOOLEAN_QUESTIONS.map((question) => (
        <CheckboxRow
          key={question.key}
          label={question.label}
          help={question.help}
          checked={answers[question.key] === true}
          onChange={(checked) => onChange(setBooleanAnswer(answers, question.key, checked))}
          disabled={disabled}
          testID={testID ? `${testID}-${question.key}` : undefined}
        />
      ))}
      {ownsVehicle ? (
        <View style={styles.brands}>
          <AppText variant="label" accessibilityRole="header">
            {onboarding.whichBrands.text}
          </AppText>
          <View style={styles.chips}>
            {VEHICLE_BRANDS.map((brand) => (
              <Chip
                key={brand}
                label={brand}
                selected={brands.includes(brand)}
                onPress={() => onChange(toggleBrandAnswer(answers, brand))}
                disabled={disabled}
                testID={testID ? `${testID}-brand-${brand}` : undefined}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space[3],
  },
  intro: {
    gap: space[1],
  },
  brands: {
    gap: space[2],
    paddingLeft: space[4],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
