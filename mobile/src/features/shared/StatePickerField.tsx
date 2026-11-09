import { US_STATES } from '@shared/lib/utils';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Divider, Icon, IconButton } from '@/components/ui';
import { Check, ChevronDown, Search, X } from '@/components/ui/icons';
import { STACK_VALUE_FONT_SCALE } from '@/components/ui/ListItem';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import { colors, layout, maxFontScale, radii, space, touchTarget, typography } from '@/theme/tokens';

interface StateOption {
  code: string;
  name: string;
}

export interface StatePickerFieldProps {
  label: string;
  /** Two-letter code, or '' for none. */
  value: string;
  onChange: (code: string) => void;
  /** Shown when nothing is chosen, and as the list's first row, which clears the choice (the web's empty option). */
  placeholder: string;
  hint?: string;
  disabled?: boolean;
  /** A control beside the field, such as a Copy button. It moves under the field at large text sizes. */
  trailing?: ReactNode;
  testID?: string;
}

/** The state's name for a code from US_STATES, or null. */
export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return US_STATES.find((state) => state.code === upper)?.name ?? null;
}

/** States whose name or code contains the search, in US_STATES order. */
export function filterStates(query: string): StateOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return US_STATES;
  return US_STATES.filter(
    (state) => state.name.toLowerCase().includes(needle) || state.code.toLowerCase() === needle,
  );
}

/**
 * The web's state <select> (US_STATES): a field that opens a searchable list
 * in a sheet (pageSheet on iOS, full screen on Android). Read as the label
 * with the chosen state as its value. The chosen row has a checkmark and is
 * announced as selected; the first row clears the choice.
 */
export function StatePickerField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
  trailing,
  testID,
}: StatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const stacked = trailing != null && fontScale >= STACK_VALUE_FONT_SCALE;
  const chosen = stateName(value);

  const field = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: chosen ?? placeholder }}
      accessibilityState={{ disabled, expanded: open }}
      disabled={disabled}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [
        styles.box,
        trailing != null && !stacked ? styles.grow : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      testID={testID}
    >
      <AppText variant="body" color={chosen ? 'text' : 'textMuted'} style={styles.value}>
        {chosen ?? placeholder}
      </AppText>
      <Icon icon={ChevronDown} size="sm" color="textSoft" />
    </Pressable>
  );

  return (
    <View style={styles.field}>
      <AppText variant="label" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
      </AppText>
      {trailing != null ? (
        <View style={stacked ? styles.stacked : styles.beside}>
          {field}
          {trailing}
        </View>
      ) : (
        field
      )}
      {hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
      {open ? (
        <StatePickerSheet
          title={label}
          value={value}
          placeholder={placeholder}
          onClose={() => setOpen(false)}
          onSelect={(code) => {
            onChange(code);
            setOpen(false);
          }}
          testID={testID ? `${testID}-sheet` : undefined}
        />
      ) : null}
    </View>
  );
}

function StatePickerSheet({
  title,
  value,
  placeholder,
  onClose,
  onSelect,
  testID,
}: {
  title: string;
  value: string;
  placeholder: string;
  onClose: () => void;
  onSelect: (code: string) => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const [query, setQuery] = useState('');
  const rows = useMemo<StateOption[]>(
    () => (query.trim() ? filterStates(query) : [{ code: '', name: placeholder }, ...US_STATES]),
    [query, placeholder],
  );
  const current = value.toUpperCase();

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      testID={testID}
    >
      <View style={[styles.sheet, { paddingTop: android ? insets.top : 0 }]}>
        <View style={styles.sheetHeader}>
          <AppText variant="heading" style={styles.sheetTitle}>
            {title}
          </AppText>
          <IconButton icon={X} accessibilityLabel={common.close.text} color="text" onPress={onClose} />
        </View>
        <View style={styles.search}>
          <Icon icon={Search} size="sm" color="textSoft" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={shared.searchStates.text}
            accessibilityLabel={shared.searchStates.text}
            placeholderTextColor={colors.textPlaceholder}
            autoCorrect={false}
            autoCapitalize="words"
            autoComplete="off"
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            allowFontScaling
            maxFontSizeMultiplier={maxFontScale.body}
            underlineColorAndroid="transparent"
            cursorColor={colors.primary}
            style={styles.searchInput}
            testID={testID ? `${testID}-search` : undefined}
          />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.code || 'none'}
          // 52 short rows: render them all at once, so screen readers can move through the whole list.
          initialNumToRender={US_STATES.length + 1}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={android ? 'on-drag' : 'interactive'}
          automaticallyAdjustKeyboardInsets
          ItemSeparatorComponent={RowDivider}
          contentContainerStyle={{ paddingBottom: space[8] + insets.bottom }}
          ListEmptyComponent={
            <AppText variant="body" color="textMuted" style={styles.empty}>
              {shared.noMatchingStates.text}
            </AppText>
          }
          renderItem={({ item }) => {
            const selected = item.code === current;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected }}
                onPress={() => onSelect(item.code)}
                style={({ pressed }) => [styles.option, pressed ? styles.pressed : null]}
                testID={testID ? `${testID}-option-${item.code || 'none'}` : undefined}
              >
                <AppText variant="body" color={item.code ? 'text' : 'textMuted'} style={styles.value}>
                  {item.name}
                </AppText>
                {selected ? <Icon icon={Check} size="md" color="primary" /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function RowDivider() {
  return <Divider inset={5} />;
}

const styles = StyleSheet.create({
  field: {
    gap: space[2],
  },
  beside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  stacked: {
    alignItems: 'flex-start',
    gap: space[2],
  },
  grow: {
    flex: 1,
  },
  box: {
    alignSelf: 'stretch',
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.5,
  },
  value: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingLeft: layout.screenPadding,
    paddingRight: space[2],
    paddingVertical: space[2],
  },
  sheetTitle: {
    flex: 1,
  },
  search: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginHorizontal: layout.screenPadding,
    marginBottom: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.text,
    paddingVertical: space[2],
    paddingHorizontal: 0,
  },
  option: {
    minHeight: touchTarget + space[1],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },
  empty: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[6],
  },
});
