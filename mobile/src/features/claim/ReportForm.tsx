import { validateFiledOn, type ClaimView } from '@shared/lib/claims';
import { useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type HostInstance, type TextInputInstance } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { claim as copy } from '@/copy/claim';
import { now } from '@/lib/clock';
import { space } from '@/theme/tokens';

import { ClaimError } from './ClaimError';
import { ConfirmationNumberField, checkConfirmationNumber } from './ConfirmationNumberField';
import { FiledOnField } from './FiledOnField';
import { useClaimWrites, type OnClaimChange } from './use-claim-writes';

export interface ReportFormProps {
  lawsuitId: string;
  claim: ClaimView | null;
  /** Offer "Not yet: save to my claims" (no claim yet, settlement open for claims). */
  allowSave: boolean;
  onChange: OnClaimChange;
}

/**
 * "I filed my claim" with an optional confirmation number and filing date
 * (src/components/claims/ReportFiled.tsx ReportForm). Both are checked on the
 * device with the server's rules first. Without a claim, the report starts
 * one (intent report_filed), which the server also allows after the deadline,
 * within 30 days.
 */
export function ReportForm({ lawsuitId, claim, allowSave, onChange }: ReportFormProps) {
  const writes = useClaimWrites();
  const [number, setNumber] = useState('');
  const [filedOn, setFiledOn] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<null | 'report' | 'save'>(null);
  const numberRef = useRef<TextInputInstance>(null);
  const dateRef = useRef<HostInstance>(null);

  async function ensureClaim(): Promise<ClaimView | null> {
    if (claim) return claim;
    // Starting the claim to report filing is accepted after the deadline too
    // (within 30 days), unlike saving it before filing.
    try {
      return (await writes.startTracking({ lawsuitId, intent: 'report_filed' })).claim;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }

  async function report() {
    if (busy) return;
    const numberCheck = checkConfirmationNumber(number, false);
    const dateCheck = filedOn ? validateFiledOn(filedOn, now()) : null;
    setNumberError(numberCheck.ok ? null : numberCheck.error);
    setDateError(dateCheck && !dateCheck.ok ? dateCheck.message : null);
    if (!numberCheck.ok) {
      // Take people to the first field to fix.
      numberRef.current?.focus();
      return;
    }
    if (dateCheck && !dateCheck.ok) {
      if (dateRef.current) AccessibilityInfo.sendAccessibilityEvent(dateRef.current, 'focus');
      return;
    }

    setError(null);
    setBusy('report');
    const current = await ensureClaim();
    if (!current) {
      setBusy(null);
      return;
    }
    try {
      const result = await writes.changeClaim({
        claimId: current.id,
        body: {
          action: 'report_filed',
          ...(numberCheck.value ? { confirmation_number: numberCheck.value } : {}),
          ...(dateCheck?.ok ? { filed_on: dateCheck.value } : {}),
        },
      });
      setBusy(null);
      onChange(result.claim, numberCheck.value ? copy.savedSubmitted.text : copy.savedReported.text, { reported: true });
    } catch (caught) {
      setBusy(null);
      setError(caught);
    }
  }

  async function save() {
    if (busy) return;
    setError(null);
    setBusy('save');
    try {
      const started = await writes.startTracking({ lawsuitId });
      setBusy(null);
      onChange(started.claim, copy.savedTracking.text);
    } catch (caught) {
      setBusy(null);
      setError(caught);
    }
  }

  return (
    <View style={styles.form}>
      <ConfirmationNumberField
        value={number}
        onChange={setNumber}
        error={numberError}
        inputRef={numberRef}
        testID="claim-report-number"
      />
      <FiledOnField value={filedOn} onChange={setFiledOn} error={dateError} fieldRef={dateRef} disabled={busy !== null} />
      <View style={styles.actions}>
        <Button
          label={busy === 'report' ? copy.saving.text : copy.iFiledMyClaim.text}
          loading={busy === 'report'}
          disabled={busy !== null}
          onPress={() => void report()}
          fullWidth
        />
        {allowSave ? (
          <Button
            label={copy.notYetSave.text}
            variant="secondary"
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={() => void save()}
            fullWidth
          />
        ) : null}
      </View>
      <AppText variant="caption" color="textMuted">
        {copy.noNumberYet.text}
      </AppText>
      <ClaimError error={error} testID="claim-report-error" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
  actions: {
    gap: space[3],
  },
});
