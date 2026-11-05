import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Icon, IconButton } from '@/components/ui';
import { Search, X } from '@/components/ui/icons';
import { catalog } from '@/copy/catalog';
import { colors, fontFamilies, maxFontScale, radii, space, touchTarget, typography } from '@/theme/tokens';

import { SEARCH_MAX_LENGTH } from './use-catalog-filters';

export interface CatalogSearchFieldProps {
  value: string;
  onChangeText(text: string): void;
  /** The keyboard's search key. */
  onSubmit(): void;
  onClear(): void;
}

/**
 * The catalog's search box (src/components/LawsuitFilters.tsx): the web's
 * placeholder and screen-reader label, at most 100 characters, and a clear
 * button while it holds text. Autocorrect is off, so a company name is
 * searched as typed.
 */
export function CatalogSearchField({ value, onChangeText, onSubmit, onClear }: CatalogSearchFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused ? styles.focused : null]}>
      <View style={styles.leadingIcon}>
        <Icon icon={Search} size="sm" color="textMuted" />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={catalog.searchPlaceholder.text}
        placeholderTextColor={colors.textPlaceholder}
        accessibilityLabel={catalog.searchLabel.text}
        accessibilityRole="search"
        maxLength={SEARCH_MAX_LENGTH}
        enterKeyHint="search"
        submitBehavior="blurAndSubmit"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        clearButtonMode="never"
        maxFontSizeMultiplier={maxFontScale.body}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        style={styles.input}
      />
      {value ? (
        <IconButton icon={X} size="sm" accessibilityLabel={catalog.clearSearch.text} onPress={onClear} style={styles.clear} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: colors.focusRing,
  },
  leadingIcon: {
    paddingLeft: space[4] - 2,
    paddingRight: space[2],
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: space[3],
    paddingRight: space[2],
    color: colors.text,
    fontFamily: fontFamilies.sans,
    fontSize: typography.body.fontSize,
  },
  clear: {
    marginRight: space[1],
  },
});
