import { useRef } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ExternalLink } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { openExternalUrl, toSafeWebUrl } from '@/lib/external-link';
import { colors, radii, space, touchTarget } from '@/theme/tokens';

export interface ExternalTextLinkProps {
  url: string;
  /** Visible text. */
  label: string;
  /** Spoken name when the visible text needs context, such as "Official site for {title}". */
  accessibilityLabel?: string;
  /** 'warning' for links inside the amber unverified notices. */
  tone?: 'link' | 'warning';
  /** A white bordered pill (the settlement page's "Go to the official site"), instead of underlined text. */
  framed?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A text link to a website (official site, source page, license), opened in
 * the in-app browser. Announced as a link with the "opens in a browser" hint,
 * and at least 44 pt tall even when it looks like inline text. Disabled when
 * the URL is not a website.
 */
export function ExternalTextLink({
  url,
  label,
  accessibilityLabel,
  tone = 'link',
  framed = false,
  style,
  testID,
}: ExternalTextLinkProps) {
  const safeUrl = toSafeWebUrl(url);
  const opening = useRef(false);
  const color = tone === 'warning' ? 'warningStrong' : 'textLink';

  async function open() {
    if (!safeUrl || opening.current) return;
    opening.current = true;
    try {
      await openExternalUrl(safeUrl);
    } finally {
      opening.current = false;
    }
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={common.opensInBrowserHint.text}
      accessibilityState={{ disabled: !safeUrl }}
      disabled={!safeUrl}
      onPress={() => {
        void open();
      }}
      style={({ pressed }) => [
        styles.link,
        framed ? styles.framed : null,
        framed && tone === 'warning' ? styles.framedWarning : null,
        pressed ? pressedStyle(framed, tone) : null,
        safeUrl ? null : styles.disabled,
        style,
      ]}
      testID={testID}
    >
      <AppText variant="labelSmall" color={color} style={framed ? styles.text : [styles.text, styles.underline]}>
        {label}
      </AppText>
      <Icon icon={ExternalLink} size="xs" color={color} />
    </Pressable>
  );
}

function pressedStyle(framed: boolean, tone: 'link' | 'warning') {
  if (!framed) return styles.pressed;
  return tone === 'warning' ? styles.framedWarningPressed : styles.framedPressed;
}

const styles = StyleSheet.create({
  link: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
  },
  text: {
    flexShrink: 1,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
  },
  framed: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  framedWarning: {
    borderColor: colors.warningBorder,
  },
  framedPressed: {
    backgroundColor: colors.surfacePressed,
  },
  framedWarningPressed: {
    // amber-200: a visible press against the white pill (the web's hover:bg-amber-100 is too faint).
    backgroundColor: colors.warningBorder,
  },
  disabled: {
    opacity: 0.5,
  },
});
