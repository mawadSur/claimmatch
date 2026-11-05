import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDeadline } from '@shared/lib/utils';
import { useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, View, type HostInstance } from 'react-native';

import { AppText, Button, FieldError, Icon } from '@/components/ui';
import { Calendar } from '@/components/ui/icons';
import { claim as copy } from '@/copy/claim';
import { now } from '@/lib/clock';
import { colors, radii, space, touchTarget } from '@/theme/tokens';

import { EARLIEST_FILING_DAY, dayToDate, endOfDay, latestFilingDay, localISODate, startOfDay } from './dates';

export interface FiledOnFieldProps {
  /** YYYY-MM-DD, or '' when not given. */
  value: string;
  onChange: (day: string) => void;
  error?: string | null;
  fieldRef?: Ref<HostInstance>;
  disabled?: boolean;
}

/** Today on this device and the last day the picker offers (latestFilingDay), skew-corrected. */
function readToday(): { today: string; latest: string } {
  const at = now();
  return { today: localISODate(at), latest: latestFilingDay(at) };
}

/**
 * "Date you filed (optional)" (src/components/claims/ReportFiled.tsx) with
 * the native picker: an inline calendar under the field on iOS, the system
 * dialog on Android. Only 2000-01-01 through today (latestFilingDay) can be
 * picked. The date is never filled in for the person: an unnoticed default
 * would record today for a claim filed earlier, and it is shown back as fact.
 * It is set only by picking a day, "I filed today", or confirming the day
 * the picker shows: Done on iOS (whose calendar opens on today and sends
 * nothing when that same day is tapped), OK in the Android dialog. Tapping
 * the field again closes the iOS calendar without a date. "Today" is read
 * again whenever the picker opens or "I filed today" is tapped, so a screen
 * left open past midnight stays right.
 */
export function FiledOnField({ value, onChange, error, fieldRef, disabled = false }: FiledOnFieldProps) {
  const [open, setOpen] = useState(false);
  const [{ today, latest }, setDays] = useState(readToday);
  const ios = Platform.OS === 'ios';
  const shown = value ? formatDeadline(value) : copy.chooseDate.text;
  const minimumDate = startOfDay(EARLIEST_FILING_DAY);
  const pick = (date: Date) => onChange(localISODate(date));
  const valueFor = (days: { today: string }) => dayToDate(value || days.today, startOfDay(EARLIEST_FILING_DAY));

  function openPicker() {
    const days = readToday();
    setDays(days);
    if (ios) {
      setOpen((current) => !current);
      return;
    }
    DateTimePickerAndroid.open({
      value: valueFor(days),
      mode: 'date',
      minimumDate,
      maximumDate: endOfDay(days.latest),
      onValueChange: (_event, date) => pick(date),
    });
  }

  return (
    <View style={styles.field}>
      <AppText variant="label" accessible={false} importantForAccessibility="no">
        {copy.dateYouFiled.text}
        <AppText variant="caption" color="textMuted">{` ${copy.optional.text}`}</AppText>
      </AppText>
      <Pressable
        ref={fieldRef}
        accessibilityRole="button"
        accessibilityLabel={`${copy.dateYouFiled.text} ${copy.optional.text}`}
        accessibilityValue={{ text: shown }}
        accessibilityHint={[error, copy.leaveBlank.text].filter(Boolean).join(' ')}
        accessibilityState={{ disabled, ...(ios ? { expanded: open } : null) }}
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [styles.input, pressed ? styles.pressed : null, error ? styles.invalid : null]}
        testID="claim-filed-on"
      >
        <AppText variant="body" color={value ? 'text' : 'textSoft'} style={styles.value}>
          {shown}
        </AppText>
        <Icon icon={Calendar} size="sm" color="textMuted" />
      </Pressable>
      {ios && open ? (
        <View style={styles.picker}>
          <DateTimePicker
            value={valueFor({ today })}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={endOfDay(latest)}
            onValueChange={(_event, date) => pick(date)}
            accentColor={colors.primary}
            themeVariant="light"
            testID="claim-filed-on-picker"
          />
          <Button
            label={copy.doneChoosingDate.text}
            variant="secondary"
            onPress={() => {
              // The calendar shows today until a day is picked; Done keeps the day it shows.
              if (!value) onChange(today);
              setOpen(false);
            }}
            testID="claim-filed-on-done"
          />
        </View>
      ) : null}
      {/* "I filed today" until today is chosen; "Clear the date" once one is. */}
      <View style={styles.actions}>
        {value !== today ? (
          <Button
            label={copy.iFiledToday.text}
            variant="ghost"
            disabled={disabled}
            onPress={() => {
              const days = readToday();
              setDays(days);
              onChange(days.today);
              setOpen(false);
            }}
          />
        ) : null}
        {value ? (
          <Button label={copy.clearDate.text} variant="ghost" disabled={disabled} onPress={() => onChange('')} />
        ) : null}
      </View>
      <AppText variant="caption" color="textMuted" accessible={false} importantForAccessibility="no">
        {copy.leaveBlank.text}
      </AppText>
      <FieldError message={error} testID="claim-filed-on-error" />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space[2],
  },
  input: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  invalid: {
    borderColor: colors.dangerIcon,
  },
  value: {
    flex: 1,
  },
  picker: {
    gap: space[2],
    padding: space[2],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
