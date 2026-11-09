import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText, ListItem, SectionHeader } from '@/components/ui';
import { Trash } from '@/components/ui/icons';
import { settings } from '@/copy/settings';
import { ExternalTextLink } from '@/features/shared';
import { useConfig } from '@/providers/ConfigProvider';
import { space, touchTarget } from '@/theme/tokens';

import { WEB_LINKS } from './links';
import { SettingsGroup } from './SettingsGroup';

/**
 * "Your data" (src/app/settings/page.tsx:87-117): what the Privacy Policy
 * covers, the contact email from GET /api/mobile/config, the match-quality
 * note, and in-app account deletion (plan 5, Apple 5.1.1(v)).
 */
export function YourDataSection() {
  const router = useRouter();
  const { legal } = useConfig();
  const email = legal.contactEmail;
  const body = `${settings.our.text} ${settings.privacyPolicy.text} ${settings.explainsWhatWeStore.text}${
    email ? ` ${settings.byEmailing.text} ${email}` : ''
  }.`;

  return (
    <View style={styles.section}>
      <SectionHeader title={settings.yourDataTitle.text} />
      <AppText variant="caption" color="textMuted">
        {body}
      </AppText>
      <View style={styles.links}>
        <ExternalTextLink url={WEB_LINKS.privacy} label={settings.privacyPolicy.text} testID="settings-data-privacy" />
        {email ? <MailLink email={email} /> : null}
      </View>
      <AppText variant="caption" color="textMuted">
        {`${settings.metricsNote.text} ${settings.metricsNoteWhere.text}`}
      </AppText>
      <SettingsGroup>
        <ListItem
          icon={Trash}
          title={settings.deleteTitle.text}
          destructive
          onPress={() => router.push('/delete-account')}
          testID="settings-delete"
        />
      </SettingsGroup>
    </View>
  );
}

/** The contact address as a 44 pt link that opens a new email. */
function MailLink({ email }: { email: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={email}
      onPress={() => void Linking.openURL(`mailto:${email}`).catch(() => undefined)}
      style={({ pressed }) => [styles.mail, pressed ? styles.pressed : null]}
      testID="settings-data-email"
    >
      <AppText variant="labelSmall" color="textLink" style={styles.underline}>
        {email}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[5],
  },
  mail: {
    minHeight: touchTarget,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
