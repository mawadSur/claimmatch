import { StyleSheet, View } from 'react-native';

import { useAnnounce } from '@/hooks/use-announce';
import { space } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { CircleAlert } from './icons';

export interface FieldErrorProps {
  message: string | null | undefined;
  testID?: string;
}

/**
 * The error under a field, in red with an icon, announced when it appears
 * (an iOS announcement, an Android live region). Renders nothing without a
 * message.
 */
export function FieldError({ message, testID }: FieldErrorProps) {
  useAnnounce(message);
  if (!message) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={styles.row}
      testID={testID}
    >
      <View style={styles.icon}>
        <Icon icon={CircleAlert} size="sm" color="dangerIcon" />
      </View>
      <AppText variant="caption" color="danger" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  icon: {
    // Centers the 16 pt icon on the first 20 pt line of caption text.
    paddingTop: 2,
  },
  text: {
    flexShrink: 1,
  },
});
