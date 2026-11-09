import { Screen } from '@/components/ui';
import { FileText, Info, ShieldCheck } from '@/components/ui/icons';
import { settings } from '@/copy/settings';
import { LegalDisclaimer, SettleSignalCredit, ShortDisclaimer } from '@/features/shared';

import { WEB_LINKS } from './links';
import { SettingsGroup } from './SettingsGroup';
import { WebLinkRow } from './WebLinkRow';

/**
 * /settings/legal (plan 3.3): the full LEGAL_DISCLAIMER and SHORT_DISCLAIMER
 * from GET /api/mobile/config (bundled text until it loads), the SettleSignal
 * credit of the site footer (src/components/Footer.tsx), and the website's
 * Privacy Policy, Terms and How we make money pages.
 */
export function LegalScreen() {
  return (
    <Screen testID="settings-legal">
      <LegalDisclaimer />
      <ShortDisclaimer />
      <SettleSignalCredit variant="footer" />
      <SettingsGroup>
        <WebLinkRow icon={ShieldCheck} title={settings.privacyPolicy.text} url={WEB_LINKS.privacy} testID="legal-privacy" />
        <WebLinkRow icon={FileText} title={settings.terms.text} url={WEB_LINKS.terms} testID="legal-terms" />
        <WebLinkRow
          icon={Info}
          title={settings.howWeMakeMoney.text}
          url={WEB_LINKS.howWeMakeMoney}
          testID="legal-money"
        />
      </SettingsGroup>
    </Screen>
  );
}
