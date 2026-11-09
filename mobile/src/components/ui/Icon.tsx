import { colors, iconSizes, type ColorToken, type IconSize } from '@/theme/tokens';

import type { LucideIcon } from './icons';

export interface IconProps {
  /** A lucide icon from '@/components/ui/icons'. */
  icon: LucideIcon;
  size?: IconSize;
  color?: ColorToken;
  /** Lucide's default stroke is 2, as on the website. */
  strokeWidth?: number;
  /**
   * Only for an icon that carries meaning on its own. Without a label the
   * icon is decorative and hidden from screen readers (its text says it).
   */
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({ icon: Glyph, size = 'md', color = 'text', strokeWidth = 2, accessibilityLabel, testID }: IconProps) {
  const dimension = iconSizes[size];
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  return <Glyph size={dimension} color={colors[color]} strokeWidth={strokeWidth} testID={testID} {...a11y} />;
}
