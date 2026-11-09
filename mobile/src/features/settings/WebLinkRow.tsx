import { Icon, ListItem } from '@/components/ui';
import { ExternalLink, type LucideIcon } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { openExternalUrl } from '@/lib/external-link';

/** A row that opens a page of the website in the in-app browser, announced as a link. */
export function WebLinkRow({
  title,
  url,
  icon,
  testID,
}: {
  title: string;
  url: string;
  icon?: LucideIcon;
  testID?: string;
}) {
  return (
    <ListItem
      icon={icon}
      title={title}
      accessibilityRole="link"
      accessibilityHint={common.opensInBrowserHint.text}
      trailing={<Icon icon={ExternalLink} size="sm" color="textSoft" />}
      onPress={() => void openExternalUrl(url)}
      testID={testID}
    />
  );
}
