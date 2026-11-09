import {
  canReportWithoutClaim,
  claimActionAvailability,
  displayClaimStatus,
  displayConfirmationNumber,
  isKnownClaimStatus,
  reportByDay,
  type ClaimView,
  type SettlementContext,
} from '@shared/lib/claims';
import { formatDeadline } from '@shared/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type HostInstance } from 'react-native';

import { AppText, Button, Divider, Icon } from '@/components/ui';
import { BadgeCheck, CircleCheck, Pencil, Undo2, type LucideIcon } from '@/components/ui/icons';
import { claim as copy, reportedTitle, submittedNote, undoWarning, undoneMessage } from '@/copy/claim';
import { colors, radii, space, type ColorToken } from '@/theme/tokens';

import { AddConfirmationForm } from './AddConfirmationForm';
import { ClaimError } from './ClaimError';
import { ReportForm } from './ReportForm';
import { useClaimWrites, type OnClaimChange } from './use-claim-writes';

/** U+200B ZERO WIDTH SPACE: a place where a line may break, showing nothing. */
const ZERO_WIDTH_SPACE = '​';

export interface ReportFiledProps {
  lawsuitId: string;
  claim: ClaimView | null;
  context: SettlementContext;
  /** Offer "Save to my claims" (before tracking starts, while the settlement is open). */
  allowSave: boolean;
  onChange: OnClaimChange;
}

/**
 * Step 3, "Tell us when you’ve filed" (src/components/claims/ReportFiled.tsx):
 * the report form, or the reported or submitted state with "add the number
 * later", "undo" and "correct". What each state offers comes from
 * claimActionAvailability and canReportWithoutClaim.
 */
export function ReportFiled({ lawsuitId, claim, context, allowSave, onChange }: ReportFiledProps) {
  if (claim?.status === 'reported_filed') return <ReportedCard claim={claim} context={context} onChange={onChange} />;
  const display = claim ? displayClaimStatus(claim, context) : null;
  if (claim && display?.kind === 'submitted') {
    return <SubmittedCard claim={claim} context={context} label={display.label} onChange={onChange} />;
  }
  // Without a claim, "I filed my claim" starts one: allowed until 30 days after
  // the deadline, also once the settlement no longer takes new claims.
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : canReportWithoutClaim(context);
  if (!canReport) {
    let text: string = copy.windowClosedClaim.text;
    if (!claim) text = copy.windowClosedNoClaim.text;
    else if (claim.status === 'withdrawn') text = copy.stoppedTracking.text;
    else if (!isKnownClaimStatus(claim.status)) text = copy.cantUpdate.text;
    return (
      <View style={[styles.box, styles.neutral]} testID="claim-report-unavailable">
        <AppText variant="caption" color="textMuted">
          {text}
        </AppText>
      </View>
    );
  }
  return <ReportForm lawsuitId={lawsuitId} claim={claim} allowSave={allowSave && !claim} onChange={onChange} />;
}

/**
 * "Submitted · #WMG-4X8K-22917" as shown: a zero-width space after each "-"
 * of the number, so at the largest text sizes it wraps after a hyphen
 * instead of inside the number (a hyphen before a digit is no break point).
 */
function shownSubmittedTitle(label: string, confirmationNumber: string | null): string {
  const number = confirmationNumber ? displayConfirmationNumber(confirmationNumber) : '';
  if (!number || !label.endsWith(number)) return label;
  return `${label.slice(0, -number.length)}${number.split('-').join(`-${ZERO_WIDTH_SPACE}`)}`;
}

/**
 * The reported or submitted state, read as one phrase: the title, then the
 * body, joined as iOS and Android join a group's texts. Screen readers get
 * `title`; the screen shows `shownTitle` when it has break points.
 */
function StateBox({
  icon,
  iconColor,
  surface,
  title,
  shownTitle = title,
  body,
}: {
  icon: LucideIcon;
  iconColor: ColorToken;
  surface: ColorToken;
  title: string;
  shownTitle?: string;
  body: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${body}`}
      style={[styles.box, styles.row, { backgroundColor: colors[surface] }]}
    >
      <Icon icon={icon} size="md" color={iconColor} />
      <View style={styles.text}>
        <AppText variant="bodyStrong">{shownTitle}</AppText>
        <AppText variant="caption" color="textMuted">
          {body}
        </AppText>
      </View>
    </View>
  );
}

function ReportedCard({ claim, context, onChange }: { claim: ClaimView; context: SettlementContext; onChange: OnClaimChange }) {
  const writes = useClaimWrites();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const questionRef = useRef<HostInstance>(null);
  const askedRef = useRef<HostInstance>(null);
  const returnFocus = useRef(false);
  const can = claimActionAvailability(claim, context);
  // After the deadline a "not filed" claim can only be reported until this day.
  const lastDay = context.deadlinePassed ? reportByDay(claim, context.deadline) : null;
  const lastDayText = lastDay ? formatDeadline(lastDay) : null;

  useEffect(() => {
    // Move screen-reader focus to the question, and back when it closes.
    const target = confirming ? questionRef.current : returnFocus.current ? askedRef.current : null;
    returnFocus.current = false;
    if (target) AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
  }, [confirming]);

  async function undo() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await writes.changeClaim({ claimId: claim.id, body: { action: 'undo_report' } });
      setBusy(false);
      onChange(result.claim, undoneMessage(displayClaimStatus(result.claim, context).label, lastDayText));
    } catch (caught) {
      setBusy(false);
      setError(caught);
    }
  }

  return (
    <View style={styles.stack}>
      <StateBox
        icon={CircleCheck}
        iconColor="infoIcon"
        surface="background"
        title={reportedTitle(claim.user_filed_on ? formatDeadline(claim.user_filed_on) : null)}
        body={copy.nextAddNumber.text}
      />
      {can.addConfirmation ? <AddConfirmationForm claimId={claim.id} onSaved={(next, message) => onChange(next, message)} /> : null}
      {can.undoReport ? (
        <View style={styles.undo}>
          <Divider />
          {confirming ? (
            <View style={styles.stackTight}>
              <View ref={questionRef} accessible accessibilityRole="header">
                <AppText variant="bodyStrong">{copy.undoQuestion.text}</AppText>
              </View>
              <AppText variant="caption" color="textMuted">
                {undoWarning(lastDayText)}
              </AppText>
              <View style={styles.stackTight}>
                <Button
                  label={copy.yesUndo.text}
                  variant="secondary"
                  loading={busy}
                  onPress={() => void undo()}
                  fullWidth
                />
                <Button
                  label={copy.keepReport.text}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    returnFocus.current = true;
                    setConfirming(false);
                    setError(null);
                  }}
                  fullWidth
                />
              </View>
            </View>
          ) : (
            <View style={styles.stackTight}>
              <View ref={askedRef} accessible>
                <AppText variant="caption" color="textMuted">
                  {copy.toldByMistake.text}
                </AppText>
              </View>
              <Button
                label={copy.undoButton.text}
                variant="ghost"
                icon={Undo2}
                bleed="start"
                onPress={() => setConfirming(true)}
                style={styles.start}
              />
            </View>
          )}
          <ClaimError error={error} testID="claim-undo-error" />
        </View>
      ) : null}
    </View>
  );
}

function SubmittedCard({
  claim,
  context,
  label,
  onChange,
}: {
  claim: ClaimView;
  context: SettlementContext;
  label: string;
  onChange: OnClaimChange;
}) {
  const [editing, setEditing] = useState(false);
  const canCorrect = claimActionAvailability(claim, context).correctConfirmation;
  return (
    <View style={styles.stack}>
      <StateBox
        icon={BadgeCheck}
        iconColor="successIcon"
        surface="successSurface"
        title={label}
        shownTitle={shownSubmittedTitle(label, claim.confirmation_number)}
        body={submittedNote(claim.user_filed_on ? formatDeadline(claim.user_filed_on) : null)}
      />
      {canCorrect && editing ? (
        <AddConfirmationForm
          claimId={claim.id}
          initialValue={claim.confirmation_number ?? ''}
          submitLabel={copy.saveNumber.text}
          onSaved={(next) => {
            setEditing(false);
            onChange(next, copy.numberUpdated.text);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      {canCorrect && !editing ? (
        <Button
          label={copy.correctNumber.text}
          variant="ghost"
          icon={Pencil}
          bleed="start"
          onPress={() => setEditing(true)}
          style={styles.start}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[4],
  },
  stackTight: {
    gap: space[2],
  },
  box: {
    padding: space[4],
    borderRadius: radii.xl,
  },
  neutral: {
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  text: {
    flex: 1,
    gap: space[1],
  },
  undo: {
    gap: space[3],
  },
  start: {
    alignSelf: 'flex-start',
  },
});
