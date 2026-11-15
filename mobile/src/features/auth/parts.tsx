import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, TextLink } from '@/components/ui';
import type { LucideIcon } from '@/components/ui/icons';
import { colors, radii, space, type ColorToken } from '@/theme/tokens';

/** Headline and intro at the top of an auth screen (the web page's h1 and lead). */
export function AuthHeader({
  title,
  body,
  icon,
  iconTone = 'brand',
}: {
  title: string;
  body?: string;
  /** Decorative tile above the title (the web's MailCheck and AlertCircle). */
  icon?: LucideIcon;
  iconTone?: 'brand' | 'success' | 'danger';
}) {
  const tile = TILES[iconTone];
  return (
    <View style={styles.header}>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: colors[tile.background] }]}>
          <Icon icon={icon} size="lg" color={tile.icon} />
        </View>
      ) : null}
      <AppText variant="display">{title}</AppText>
      {body ? (
        <AppText variant="body" color="textMuted">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

const TILES: Record<'brand' | 'success' | 'danger', { background: ColorToken; icon: ColorToken }> = {
  brand: { background: 'surfaceBrand', icon: 'textLink' },
  success: { background: 'successSurface', icon: 'successIcon' },
  danger: { background: 'dangerSurface', icon: 'dangerIcon' },
};

/** "New to Lawsuit AI? Create an account": a short prompt and its link, wrapping at large text sizes. */
export function SwitchPrompt({ prompt, link, onPress }: { prompt: string; link: string; onPress: () => void }) {
  return (
    <View style={styles.switch}>
      <AppText variant="caption" color="textMuted">
        {prompt}
      </AppText>
      <TextLink label={link} onPress={onPress} />
    </View>
  );
}

/** A block of content with the standard gap, for stacking fields and their buttons. */
export function Stack({ children, gap = 4 }: { children: ReactNode; gap?: 2 | 3 | 4 | 5 }) {
  return <View style={{ gap: space[gap] }}>{children}</View>;
}

const styles = StyleSheet.create({
  header: {
    gap: space[2],
  },
  tile: {
    width: space[12],
    height: space[12],
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  switch: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space[1],
  },
});
