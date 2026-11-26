import type { ClaimFilingView } from '@shared/lib/filing/v2/contract';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { filing as copy, signedByText } from '@/copy/filing';
import { NumberedStep } from '@/features/claim/FilingSteps';
import { FlowTarget, useFlowTargetsApi } from '@/features/claim/flow-targets';
import { ClaimStatusBadge } from '@/features/shared';
import { space } from '@/theme/tokens';

import { FILING_STATUS_COPY } from './copy-maps';
import { getFiling, moveToSelfFile, updatePacket, type FilingResult } from './api';
import { ConfirmClassStep } from './ConfirmClassStep';
import { FilingActions } from './FilingActions';
import { FilingPath, FilingTimeline } from './FilingTimeline';
import type { PacketPatch } from './form';
import { filingStatusDisplay, formatEventTime, isIntakeStatus, laneReasonLines, laneTiming, laneTitle, lastDayLine } from './model';
import { PacketItemsStep } from './PacketItemsStep';
import { Message, Muted } from './parts';
import { ReviewSignStep } from './ReviewSignStep';
import type { OnFilingView } from './use-one-click';

/** The lane below the steps: "We file this claim for you" and what happens next, or why it can't. */
function LaneCard({ view }: { view: ClaimFilingView }) {
  const timing = laneTiming(view.lane);
  const lastDay = lastDayLine(view.lane);
  return (
    <Card style={styles.card} testID="filing-lane">
      <AppText variant="heading" accessibilityRole="header">
        {laneTitle(view.lane)}
      </AppText>
      {view.claim.status === 'needs_you' ? <Message tone="error" text={FILING_STATUS_COPY.needs_you.detail} /> : null}
      {timing ? <AppText variant="caption">{timing}</AppText> : null}
      {lastDay ? <AppText variant="caption">{lastDay}</AppText> : null}
      {view.lane.agent ? <Muted>{copy.payout.text}</Muted> : null}
      {laneReasonLines(view.lane).map((reason) => (
        <Muted key={reason}>{reason}</Muted>
      ))}
    </Card>
  );
}

/** The packet is open but the lane is self-file now: say why and move on to the official site. */
function SelfFileLaneStep({ view, busy, onView }: { view: ClaimFilingView; busy: boolean; onView: OnFilingView }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setWorking(true);
    setError(null);
    const result = await moveToSelfFile(view.claim.id);
    setWorking(false);
    if (!result.ok) return setError(result.error);
    onView(result.data, copy.selfFileDone.text);
  }
  return (
    <View style={styles.card} testID="filing-self-file-lane">
      {laneReasonLines(view.lane).map((reason) => (
        <Muted key={reason}>{reason}</Muted>
      ))}
      {view.actions.can_self_file ? (
        <Button
          label={working ? copy.working.text : copy.selfFileTitle.text}
          loading={working}
          disabled={busy || working}
          onPress={() => void go()}
          fullWidth
          testID="filing-self-file-go"
        />
      ) : null}
      <Message tone="error" text={error} />
    </View>
  );
}

/** After signing (and for closed claims): the status, what happens next, the actions left and the timeline. */
export function FilingStatusCard({ view, busy, onView, message = null }: { view: ClaimFilingView; busy: boolean; onView: OnFilingView; message?: string | null }) {
  const status = view.claim.status;
  const display = filingStatusDisplay(status, view.claim.confirmation_number);
  const timing = status === 'signed' || status === 'queued' ? laneTiming(view.lane) : null;
  return (
    <Card style={styles.card} testID="filing-status">
      <AppText variant="heading" accessibilityRole="header">
        {copy.stepStatus.text}
      </AppText>
      <ClaimStatusBadge label={display.label} tone={display.tone} />
      {display.detail ? <AppText variant="caption">{display.detail}</AppText> : null}
      {timing ? <Muted>{timing}</Muted> : null}
      {view.signature ? <Muted>{signedByText(view.signature.typed_name, formatEventTime(view.signature.signed_at))}</Muted> : null}
      <FilingPath status={status} />
      <Message tone="error" text={message} />
      <FilingActions view={view} busy={busy} onView={onView} />
      <FilingTimeline entries={view.timeline} />
    </Card>
  );
}

/**
 * One-click filing for one claim on the claim screen (the web's
 * OneClickFiling): while the packet is open, (1) confirm the class
 * definition, (2) what we still need, (3) review and sign, then "File my
 * claim"; after that, the status card with the timeline. Every change goes
 * through the member API; the new view comes back through onView. Renders
 * the scroll content's children directly.
 */
export function OneClickFiling({ view, onView }: { view: ClaimFilingView; onView: OnFilingView }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const targets = useFlowTargetsApi();
  const claimId = view.claim.id;
  const revision = view.packet?.revision ?? 1;

  const refresh = useCallback(
    async (text: string) => {
      const result = await getFiling(claimId);
      if (result.ok) {
        setMessage(null);
        onView(result.data, text);
      } else setMessage(result.error);
    },
    [claimId, onView],
  );

  const save = useCallback(
    async (patch: PacketPatch): Promise<FilingResult<ClaimFilingView>> => {
      setBusy(true);
      const result = await updatePacket(claimId, revision, patch);
      setBusy(false);
      if (result.ok) onView(result.data, '');
      else if (result.code === 'revision_conflict' || result.code === 'packet_locked') await refresh('');
      return result;
    },
    [claimId, revision, onView, refresh],
  );

  const packet = view.packet;
  if (!packet || packet.status !== 'open' || !isIntakeStatus(view.claim.status)) {
    return <FilingStatusCard view={view} busy={busy} onView={onView} message={message} />;
  }
  const n = packet.spec ? 1 : 0;

  return (
    <>
      {packet.spec ? (
        <NumberedStep n={1} title={copy.stepConfirm.text} testID="filing-step-confirm">
          <ConfirmClassStep view={view} busy={busy} save={save} />
        </NumberedStep>
      ) : null}
      <FlowTarget name="filingNeed" testID="filing-step-need-target">
        <NumberedStep n={n + 1} title={copy.stepNeed.text} testID="filing-step-need">
          <PacketItemsStep view={view} busy={busy} save={save} refresh={refresh} />
        </NumberedStep>
      </FlowTarget>
      <NumberedStep n={n + 2} title={view.lane.agent ? copy.stepReview.text : copy.selfFileTitle.text} testID="filing-step-review">
        {view.lane.agent ? (
          <ReviewSignStep view={view} busy={busy} onView={onView} refresh={refresh} onChange={() => targets?.reveal('filingNeed')} />
        ) : (
          <SelfFileLaneStep view={view} busy={busy} onView={onView} />
        )}
      </NumberedStep>
      <Card style={styles.card} testID="filing-footer">
        <Message tone="error" text={message} />
        <FilingActions view={view} busy={busy} onView={onView} />
        <FilingTimeline entries={view.timeline} />
      </Card>
      <LaneCard view={view} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
});
