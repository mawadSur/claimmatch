import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { useAnnounce } from '@/hooks/use-announce';
import { fontFamilies } from '@/theme/tokens';

import type { StatusSegment } from './catalog-status';

export interface CatalogStatusLineProps {
  segments: StatusSegment[];
  testID?: string;
}

/**
 * The result count and active filters (the web's role="status"
 * aria-live="polite"). A change is announced politely: through an Android
 * live region, and on iOS queued behind current speech. The first value is
 * not announced, since it is part of the screen as it opens.
 */
export function CatalogStatusLine({ segments, testID }: CatalogStatusLineProps) {
  const message = segments.map((segment) => segment.text).join('');
  useAnnounce(message, { skipFirst: true });

  return (
    <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite" testID={testID}>
      {segments.map((segment, index) =>
        segment.strong ? (
          <AppText key={`${index}-${segment.text}`} variant="caption" color="text" style={styles.strong}>
            {segment.text}
          </AppText>
        ) : (
          segment.text
        ),
      )}
    </AppText>
  );
}

const styles = StyleSheet.create({
  strong: {
    fontFamily: fontFamilies.sansSemibold,
  },
});
