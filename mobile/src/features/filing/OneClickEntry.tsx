import type { LaneView } from '@shared/lib/filing/v2/contract';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Button, Card, Divider } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { filing as copy } from '@/copy/filing';
import { space } from '@/theme/tokens';

import { startFiling } from './api';
import { laneTiming, lastDayLine } from './model';
import { Message, Muted } from './parts';
import type { OnFilingView } from './use-one-click';

/**
 * "Lawsuit AI files this claim for you" + "Start my claim" above the
 * self-file steps (the web's OneClickEntry): only when the server offers it
 * (a strong match on an agent lane). Starting creates the claim and its
 * packet through POST /api/filing/claims; nothing is collected before the
 * tap. The self-file steps stay below.
 */
export function OneClickEntry({
  lawsuitId,
  lane,
  onStarted,
}: {
  lawsuitId: string;
  lane: LaneView | null;
  onStarted: OnFilingView;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timing = laneTiming(lane);
  const lastDay = lastDayLine(lane);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    const result = await startFiling(lawsuitId);
    setStarting(false);
    if (!result.ok) return setError(result.error);
    onStarted(result.data, copy.started.text);
  }

  return (
    <Card style={styles.card} testID="filing-entry">
      <AppText variant="heading" accessibilityRole="header">
        {copy.agentTitle.text}
      </AppText>
      <AppText variant="caption">{copy.entryIntro.text}</AppText>
      {timing ? <AppText variant="caption">{timing}</AppText> : null}
      {lastDay ? <AppText variant="caption">{lastDay}</AppText> : null}
      <Muted>{copy.payout.text}</Muted>
      <Button
        label={starting ? copy.entryStarting.text : copy.entryStart.text}
        icon={ArrowRight}
        iconPosition="trailing"
        loading={starting}
        onPress={() => void start()}
        fullWidth
        testID="filing-start"
      />
      <Message tone="error" text={error} testID="filing-start-error" />
      <Divider />
      <Muted>{copy.entryOrSelfFile.text}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
});
