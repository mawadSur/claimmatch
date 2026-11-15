import type { PacketItemView } from '@shared/lib/filing/v2/contract';
import { StyleSheet, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { AppText, CheckboxRow, Chip, FieldError, TextField } from '@/components/ui';
import { filing as copy } from '@/copy/filing';
import { StatePickerField } from '@/features/shared';
import { space } from '@/theme/tokens';

import { LOCKED_COPY } from './copy-maps';
import { MEMBER_AUTOFILL, type FieldDraft } from './form';
import { FieldIssues, Muted } from './parts';

const KEYBOARDS: Record<string, KeyboardTypeOptions> = {
  email: 'email-address',
  phone: 'phone-pad',
  integer: 'number-pad',
  decimal: 'decimal-pad',
  money: 'decimal-pad',
  zip: 'number-pad',
};

/** The date input's format (the web uses the browser's date picker, which sends the same). */
const DATE_FORMAT = 'YYYY-MM-DD';

function suffix(item: PacketItemView): string {
  return `(${item.required ? copy.required.text : copy.optional.text})`;
}

/**
 * One packet item as an input, by its type (the web's PacketFieldInput). The
 * label is the official form's wording; Jev's hints and any error sit right
 * under the field. Locked items say why instead of taking input.
 */
export function PacketFieldInput({
  item,
  draft,
  onChange,
  error,
  disabled,
}: {
  item: PacketItemView;
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
  error: string | null;
  disabled: boolean;
}) {
  const off = disabled || item.locked !== null;
  const text = Array.isArray(draft) ? '' : draft;
  const testID = `filing-field-${item.path}`;
  const footer = (
    <>
      {item.locked ? <Muted>{LOCKED_COPY[item.locked]}</Muted> : null}
      <FieldIssues issues={item.issues} testID={`${testID}-issues`} />
    </>
  );

  if (item.locked === 'not_collected') {
    return (
      <View style={styles.field} testID={testID}>
        <AppText variant="label">{`${item.label} ${suffix(item)}`}</AppText>
        {footer}
      </View>
    );
  }

  if (item.type === 'yes_no' || item.type === 'single_choice' || item.type === 'multi_choice') {
    const multi = item.type === 'multi_choice';
    const choices = item.type === 'yes_no' ? [{ value: 'yes', label: copy.yes.text }, { value: 'no', label: copy.no.text }] : (item.options ?? []);
    const selected = Array.isArray(draft) ? draft : [draft];
    return (
      <View style={styles.field} testID={testID} accessibilityRole={multi ? undefined : 'radiogroup'}>
        <AppText variant="label" accessibilityRole="header">{`${item.label} ${suffix(item)}`}</AppText>
        {item.help ? <Muted>{item.help}</Muted> : null}
        {multi ? (
          choices.map((choice) => (
            <CheckboxRow
              key={choice.value}
              appearance="plain"
              label={choice.label}
              checked={selected.includes(choice.value)}
              disabled={off}
              onChange={(on) => {
                const next = new Set(Array.isArray(draft) ? draft : []);
                if (on) next.add(choice.value);
                else next.delete(choice.value);
                onChange([...next]);
              }}
              testID={`${testID}-${choice.value}`}
            />
          ))
        ) : (
          <View style={styles.chips}>
            {choices.map((choice) => (
              <Chip
                key={choice.value}
                label={choice.label}
                selected={text === choice.value}
                disabled={off}
                accessibilityRole="radio"
                accessibilityState={{ checked: text === choice.value, disabled: off }}
                onPress={() => onChange(choice.value)}
                testID={`${testID}-${choice.value}`}
              />
            ))}
          </View>
        )}
        {footer}
        <FieldError message={error} />
      </View>
    );
  }

  if (item.type === 'us_state') {
    return (
      <View style={styles.field} testID={testID}>
        <StatePickerField
          label={`${item.label} ${suffix(item)}`}
          value={text}
          onChange={onChange}
          placeholder={copy.choose.text}
          hint={item.help ?? undefined}
          disabled={off}
          testID={`${testID}-input`}
        />
        {footer}
        <FieldError message={error} />
      </View>
    );
  }

  const code = item.type === 'notice_id' || item.type === 'vin';
  const autofill = MEMBER_AUTOFILL[item.path] as TextInputProps['autoComplete'] | undefined;
  return (
    <View style={styles.field} testID={testID}>
      <TextField
        label={item.label}
        labelSuffix={suffix(item)}
        hint={item.type === 'date' ? [item.help, DATE_FORMAT].filter(Boolean).join(' ') : (item.help ?? undefined)}
        value={text}
        onChangeText={onChange}
        error={error}
        disabled={off}
        multiline={item.type === 'long_text'}
        maxLength={item.type === 'vin' ? 17 : 2000}
        keyboardType={KEYBOARDS[item.type] ?? 'default'}
        autoComplete={autofill ?? 'off'}
        autoCapitalize={code ? 'characters' : item.type === 'email' ? 'none' : 'sentences'}
        autoCorrect={!code && item.type !== 'email'}
        placeholder={item.type === 'date' ? DATE_FORMAT : undefined}
        testID={`${testID}-input`}
      />
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
