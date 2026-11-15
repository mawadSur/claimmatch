import type { ClaimDisplay } from '@shared/lib/claims';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Divider, Icon } from '@/components/ui';
import { ShieldCheck } from '@/components/ui/icons';
import { claim as copy } from '@/copy/claim';
import { ClaimStatusBadge, DeadlineText } from '@/features/shared';
import { fontFamilies, space, typography } from '@/theme/tokens';

export interface StatusPanelProps {
  display: ClaimDisplay | null;
  deadline: string | null;
  /** The time the screen's facts were read at (the response's `now`). */
  now: Date;
  fictional: boolean;
}

function Label({ text }: { text: string }) {
  return (
    <AppText variant="badge" color="textMuted" style={styles.label}>
      {text}
    </AppText>
  );
}

/**
 * The claim's status and deadline at the top of the flow (ClaimFlow.tsx
 * StatusPanel), with the note that Lawsuit AI doesn’t file claims. A
 * fictional settlement shows its status only: there is nothing to file.
 */
export function StatusPanel({ display, deadline, now, fictional }: StatusPanelProps) {
  if (fictional) {
    return (
      <Card style={styles.panel} testID="claim-status">
        <Label text={copy.yourClaim.text} />
        {display ? <ClaimStatusBadge label={display.label} tone={display.tone} /> : null}
      </Card>
    );
  }
  return (
    <Card style={styles.panel} testID="claim-status">
      <View style={styles.item}>
        <Label text={copy.yourClaim.text} />
        {display ? (
          <ClaimStatusBadge label={display.label} tone={display.tone} />
        ) : (
          <Badge label={copy.notTrackingYet.text} tone="gray" />
        )}
      </View>
      <View style={styles.item}>
        <Label text={copy.deadline.text} />
        <DeadlineText deadline={deadline} now={now} />
      </View>
      <Divider />
      <View style={styles.note}>
        <View style={styles.noteIcon}>
          <Icon icon={ShieldCheck} size="sm" color="infoIcon" />
        </View>
        <AppText variant="caption" color="textMuted" style={styles.noteText}>
          {copy.statusNote.text}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space[4],
  },
  item: {
    gap: space[2],
  },
  label: {
    fontFamily: fontFamilies.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  noteIcon: {
    // Centered on the first line of caption text.
    minHeight: typography.caption.lineHeight,
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
  },
});
