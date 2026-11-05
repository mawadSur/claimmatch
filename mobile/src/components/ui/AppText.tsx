import { Text, type TextProps } from 'react-native';

import { colors, maxFontScale, typography, variantColor, type TextColorToken, type TextVariant } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  /** Type style; headlines use Newsreader, everything else Source Sans 3. */
  variant?: TextVariant;
  /** Semantic text color (defaults per variant). */
  color?: TextColorToken;
  align?: 'auto' | 'left' | 'center' | 'right';
}

const HEADLINES: ReadonlySet<TextVariant> = new Set(['display', 'title', 'heading']);

/**
 * All app text. Supports Dynamic Type up to a per-variant cap and never
 * truncates unless a caller passes numberOfLines. Headline variants are
 * exposed to screen readers as headers.
 */
export function AppText({
  variant = 'body',
  color,
  align,
  style,
  allowFontScaling = true,
  maxFontSizeMultiplier,
  accessibilityRole,
  ...rest
}: AppTextProps) {
  return (
    <Text
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontScale[variant]}
      accessibilityRole={accessibilityRole ?? (HEADLINES.has(variant) ? 'header' : undefined)}
      style={[typography[variant], { color: colors[color ?? variantColor[variant]] }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
