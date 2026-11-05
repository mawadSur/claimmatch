import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, ListItem, Screen } from '@/components/ui';
import { FileText, LogIn, LogOut, Scale, ShieldCheck, User, UserCog } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { signedInAsText } from '@/copy/onboarding';
import { settings } from '@/copy/settings';
import { shared } from '@/copy/shared';
import { useProfile } from '@/data/profile';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

import { AppVersion } from './AppVersion';
import { WEB_LINKS } from './links';
import { RemindersSetting } from './RemindersSetting';
import { SettingsGroup } from './SettingsGroup';
import { ShareRow } from './ShareRow';
import { WebLinkRow } from './WebLinkRow';
import { YourDataSection } from './YourDataSection';

/**
 * /settings (src/app/settings/page.tsx plus the app-only rows of plan 3.3).
 * Signed in: your details and emails, deadline reminders, Share ClaimMatch,
 * Your data with account deletion, Legal, Sign out and the app version.
 * Signed out: Log in, Create a free account, Legal, Privacy Policy and Terms.
 */
export function SettingsScreen() {
  const { status } = useAuth();
  return status === 'signedIn' ? <SignedInSettings /> : <SignedOutSettings />;
}

function SignedInSettings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    // Signs out on this device only and drops personal data; this screen then shows the signed-out rows.
    await signOut();
  }

  return (
    <Screen testID="settings-signed-in">
      <View style={styles.intro}>
        <AppText variant="body" color="textMuted">
          {settings.intro.text}
        </AppText>
        {user?.email ? (
          <AppText variant="caption" color="textSoft">
            {signedInAsText(user.email)}
          </AppText>
        ) : null}
      </View>

      <SettingsGroup>
        <ListItem
          icon={UserCog}
          title={settings.detailsTitle.text}
          onPress={() => router.push('/settings/details')}
          testID="settings-details"
        />
        <ShareRow code={profile.data?.referral_code} loading={profile.isPending} />
      </SettingsGroup>

      <RemindersSetting />

      <YourDataSection />

      <SettingsGroup>
        <ListItem icon={Scale} title={settings.legalTitle.text} onPress={() => router.push('/settings/legal')} />
        <ListItem
          icon={LogOut}
          title={settings.signOut.text}
          onPress={() => void handleSignOut()}
          disabled={signingOut}
          testID="settings-sign-out"
        />
      </SettingsGroup>

      <AppVersion />
    </Screen>
  );
}

function SignedOutSettings() {
  const router = useRouter();
  return (
    <Screen testID="settings-signed-out">
      <SettingsGroup>
        <ListItem icon={LogIn} title={common.logIn.text} onPress={() => router.push('/login')} testID="settings-log-in" />
        <ListItem
          icon={User}
          title={shared.createFreeAccount.text}
          onPress={() => router.push('/signup')}
          testID="settings-sign-up"
        />
      </SettingsGroup>

      <SettingsGroup>
        <ListItem icon={Scale} title={settings.legalTitle.text} onPress={() => router.push('/settings/legal')} />
        <WebLinkRow icon={ShieldCheck} title={settings.privacyPolicy.text} url={WEB_LINKS.privacy} />
        <WebLinkRow icon={FileText} title={settings.terms.text} url={WEB_LINKS.terms} />
      </SettingsGroup>

      <AppVersion />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: space[1],
  },
});
