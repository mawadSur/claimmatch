import { Platform, Share as ShareSheet } from 'react-native';

import { ListItem } from '@/components/ui';
import { Share, Share2 } from '@/components/ui/icons';
import { settings } from '@/copy/settings';

import { referralLink } from './links';

/**
 * "Share ClaimMatch" (src/components/ReferralCard.tsx) as one row that opens
 * the system share sheet with the personal referral link. No click or
 * sign-up counts. Before the account has a referral code, the row says so.
 */
export function ShareRow({ code, loading = false }: { code: string | null | undefined; loading?: boolean }) {
  const link = referralLink(code);
  const icon = Platform.OS === 'ios' ? Share : Share2;

  if (!link) {
    return (
      <ListItem
        icon={icon}
        title={settings.shareTitle.text}
        subtitle={loading ? settings.shareBody.text : settings.shareNoLinkYet.text}
        disabled={loading}
        testID="settings-share"
      />
    );
  }

  return (
    <ListItem
      icon={icon}
      title={settings.shareTitle.text}
      subtitle={settings.shareBody.text}
      onPress={() => {
        // iOS shares a URL (with a link preview); Android shares text.
        void ShareSheet.share(Platform.OS === 'ios' ? { url: link } : { message: link }).catch(() => undefined);
      }}
      testID="settings-share"
    />
  );
}
