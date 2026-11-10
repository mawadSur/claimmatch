import { answersFromAttributes } from '@shared/lib/profile-attributes';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInputInstance } from 'react-native';

import {
  AppText,
  Button,
  Card,
  CheckboxRow,
  FieldError,
  ListItem,
  Notice,
  Screen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { common } from '@/copy/common';
import { settings } from '@/copy/settings';
import { userFacingError } from '@/data/errors';
import { useSaveSettings, type AppProfile } from '@/data/profile';
import { StatePickerField } from '@/features/shared';
import { now } from '@/lib/clock';
import { useConfig } from '@/providers/ConfigProvider';
import { space } from '@/theme/tokens';

import {
  detailsBody,
  detailsErrors,
  firstDetailsError,
  hasAddress,
  type DetailsErrors,
  type DetailsValues,
} from './details-form';
import { MatchingQuestions } from './fields';
import { SettingsGroup } from './SettingsGroup';

/** How long "Saved" stays (src/components/NotificationPrefs.tsx). */
const SAVED_FOR_MS = 3000;

function initialValues(profile: AppProfile | null): DetailsValues {
  return {
    fullName: profile?.full_name ?? '',
    state: profile?.state ?? '',
    phone: profile?.phone ?? '',
    addressLine1: profile?.address_line1 ?? '',
    addressLine2: profile?.address_line2 ?? '',
    city: profile?.city ?? '',
    addressConsent: false,
    metricsConsent: Boolean(profile?.match_metrics_consent_at),
    answers: answersFromAttributes(profile?.attributes),
  };
}

/**
 * Your details and emails: src/components/NotificationPrefs.tsx (name, state,
 * phone, the matching answers without the health question, the metrics
 * switch) plus the copy-ready address of PrefillPacket with its consent box.
 * Starts from the profile once; later reloads (after a save) only update
 * whether address consent is already on file.
 *
 * "Email me about new settlements" is not shown: the web's own hint says
 * those emails stay paused until match alerts are enabled, so the app would
 * offer a choice that sends nothing. The form never sends email_opt_in, so the
 * choice saved on the web is kept. Show the switch again (settings.emailOptIn*)
 * once those emails go out.
 */
export function DetailsForm({ profile }: { profile: AppProfile | null }) {
  const { isFlagOn } = useConfig();
  const collectPhone = !isFlagOn('CATALOG_HIDE_UNKNOWNS_ENABLED');
  const save = useSaveSettings();
  const [values, setValues] = useState<DetailsValues>(() => initialValues(profile));
  // The matching answers on file: a save sends the answers only when they differ.
  const savedAnswers = useRef(values.answers);
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [result, setResult] = useState<'saved' | { error: string } | null>(null);
  const consentStored = Boolean(profile?.prefill_consent_at);
  const phoneRef = useRef<TextInputInstance>(null);
  const line1Ref = useRef<TextInputInstance>(null);
  const line2Ref = useRef<TextInputInstance>(null);
  const cityRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (result !== 'saved') return undefined;
    const timer = setTimeout(() => setResult((current) => (current === 'saved' ? null : current)), SAVED_FOR_MS);
    return () => clearTimeout(timer);
  }, [result]);

  function update<K extends keyof DetailsValues>(key: K, value: DetailsValues[K], field?: keyof DetailsErrors) {
    setValues((current) => ({ ...current, [key]: value }));
    if (field) setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    // "Saved" or the last error no longer describes what is on screen.
    setResult(null);
  }

  function submit() {
    if (save.isPending) return;
    Keyboard.dismiss();
    const found = detailsErrors(values, consentStored, collectPhone);
    setErrors(found);
    const problem = firstDetailsError(found);
    if (problem) {
      setResult({ error: problem });
      return;
    }
    setResult(null);
    const body = detailsBody(values, consentStored, now(), savedAnswers.current, collectPhone);
    save.mutate(body, {
      onSuccess: () => {
        if (body.attributes) savedAnswers.current = body.attributes;
        setResult('saved');
      },
      onError: (error) => setResult({ error: userFacingError(error)?.message ?? common.genericError.text }),
    });
  }

  const showConsent = hasAddress(values) && !consentStored;
  const fieldErrorShown = firstDetailsError(errors) !== null;

  return (
    <Screen hasTextFields testID="settings-details-form">
      <AppText variant="body" color="textMuted">
        {settings.detailsIntro.text}
      </AppText>

      <Card style={styles.card}>
        <TextField
          label={settings.fullNameLabel.text}
          value={values.fullName}
          onChangeText={(value) => update('fullName', value, 'full_name')}
          placeholder={settings.fullNamePlaceholder.text}
          error={errors.full_name}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          maxLength={120}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => (collectPhone ? phoneRef.current?.focus() : line1Ref.current?.focus())}
          testID="details-name"
        />
        <StatePickerField
          label={settings.stateLabel.text}
          value={values.state}
          onChange={(code) => update('state', code)}
          placeholder={settings.statePlaceholder.text}
          testID="details-state"
        />
        {collectPhone ? (
        <TextField
          ref={phoneRef}
          label={settings.phoneLabel.text}
          value={values.phone}
          onChangeText={(value) => update('phone', value, 'phone')}
          placeholder={settings.phonePlaceholder.text}
          hint={settings.phoneHint.text}
          error={errors.phone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={32}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => line1Ref.current?.focus()}
          testID="details-phone"
        />
        ) : null}
        <TextField
          ref={line1Ref}
          label={settings.addressLine1Label.text}
          value={values.addressLine1}
          onChangeText={(value) => update('addressLine1', value, 'address_line1')}
          error={errors.address_line1}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="streetAddressLine1"
          autoComplete="address-line1"
          maxLength={200}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => line2Ref.current?.focus()}
          testID="details-address1"
        />
        <TextField
          ref={line2Ref}
          label={settings.addressLine2Label.text}
          value={values.addressLine2}
          onChangeText={(value) => update('addressLine2', value, 'address_line2')}
          error={errors.address_line2}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="streetAddressLine2"
          autoComplete="address-line2"
          maxLength={200}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => cityRef.current?.focus()}
          testID="details-address2"
        />
        <TextField
          ref={cityRef}
          label={settings.cityLabel.text}
          value={values.city}
          onChangeText={(value) => update('city', value, 'city')}
          error={errors.city}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="addressCity"
          autoComplete="postal-address-locality"
          maxLength={120}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          testID="details-city"
        />
        {showConsent ? (
          <View style={styles.consent}>
            <CheckboxRow
              label={settings.saveAddressConsent.text}
              checked={values.addressConsent}
              onChange={(checked) => update('addressConsent', checked, 'consent')}
              testID="details-consent"
            />
            <FieldError message={errors.consent} testID="details-consent-error" />
          </View>
        ) : null}
      </Card>

      <SectionHeader title={settings.matchingTitle.text} description={settings.matchingIntro.text} />
      <Card>
        <MatchingQuestions
          answers={values.answers}
          onChange={(answers) => update('answers', answers)}
          testID="details-questions"
        />
      </Card>

      <SettingsGroup inset={4}>
        <ListItem
          title={settings.metricsLabel.text}
          subtitle={settings.metricsHint.text}
          toggle={{ value: values.metricsConsent, onValueChange: (on) => update('metricsConsent', on) }}
          testID="details-metrics"
        />
      </SettingsGroup>

      {result === 'saved' ? <Notice tone="success" body={settings.saved.text} testID="details-saved" /> : null}
      {result && result !== 'saved' ? (
        // A field error is already read out under its field; this copy by the button is for sight.
        <Notice tone="error" body={result.error} announce={!fieldErrorShown} testID="details-error" />
      ) : null}
      <Button
        label={save.isPending ? settings.saving.text : settings.saveChanges.text}
        loading={save.isPending}
        onPress={submit}
        fullWidth
        testID="details-save"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  consent: {
    gap: space[2],
  },
});
