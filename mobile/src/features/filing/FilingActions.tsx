import type { ClaimFilingView } from '@shared/lib/filing/v2/contract';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Chip, Divider, TextField } from '@/components/ui';
import { filing as copy } from '@/copy/filing';

import { WITHDRAW_REASON_COPY } from './copy-maps';
import {
  addConfirmationNumber,
  moveToSelfFile,
  reopenFiling,
  withdrawClaim,
  type FilingResult,
  type WithdrawReason,
} from './api';
import { Message, SubHeading, filingStyles } from './parts';
import type { OnFilingView } from './use-one-click';

type Pending = 'self_file' | 'reopen' | 'withdraw' | null;
const REASONS = Object.keys(WITHDRAW_REASON_COPY) as WithdrawReason[];

/**
 * What the member can still do with a one-click claim (the web's
 * FilingActions), each behind a short confirmation: finish on the official
 * site instead, make a change (cancels the signature), withdraw, or add the
 * administrator's confirmation number. Only what the server's actions allow.
 */
export function FilingActions({ view, busy, onView }: { view: ClaimFilingView; busy: boolean; onView: OnFilingView }) {
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<WithdrawReason>('changed_mind');
  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const { actions } = view;
  const off = busy || working;

  async function run(result: Promise<FilingResult<ClaimFilingView>>, message: string) {
    setWorking(true);
    setError(null);
    const r = await result;
    setWorking(false);
    if (!r.ok) return setError(r.error);
    setPending(null);
    onView(r.data, message);
  }

  async function saveNumber() {
    setNumberError(null);
    const value = number.trim();
    if (!value) return setNumberError(copy.confirmationEmpty.text);
    setWorking(true);
    const r = await addConfirmationNumber(view.claim.id, value);
    setWorking(false);
    if (!r.ok) return setNumberError(r.fields?.[0]?.message ?? r.error);
    setNumber('');
    onView(r.data, copy.confirmationDone.text);
  }

  const any = actions.can_self_file || actions.can_reopen || actions.can_withdraw || actions.can_add_confirmation;
  if (!any) return null;

  const confirmBox = (text: string, yes: string, act: () => void, extra?: React.ReactNode) => (
    <View style={filingStyles.section} testID="filing-confirm-box">
      <AppText variant="caption">{text}</AppText>
      {extra}
      <View style={filingStyles.row}>
        <Button label={working ? copy.working.text : yes} loading={working} disabled={off} onPress={act} testID="filing-confirm-yes" />
        <Button variant="secondary" label={copy.keep.text} disabled={working} onPress={() => setPending(null)} />
      </View>
    </View>
  );

  return (
    <View style={filingStyles.stack} testID="filing-actions">
      <Divider />
      {actions.can_add_confirmation ? (
        <View style={filingStyles.tight}>
          <SubHeading text={copy.confirmationTitle.text} />
          <TextField
            label={copy.confirmationLabel.text}
            hint={copy.confirmationHelp.text}
            value={number}
            onChangeText={setNumber}
            error={numberError}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={100}
            testID="filing-confirmation-number"
          />
          <Button variant="secondary" label={copy.confirmationSave.text} disabled={off} onPress={() => void saveNumber()} testID="filing-confirmation-save" />
        </View>
      ) : null}

      <View style={filingStyles.row}>
        {actions.can_reopen ? (
          <Button variant="secondary" label={copy.reopen.text} disabled={off} onPress={() => setPending('reopen')} testID="filing-reopen" />
        ) : null}
        {actions.can_self_file ? (
          <Button variant="secondary" label={copy.selfFile.text} disabled={off} onPress={() => setPending('self_file')} testID="filing-self-file" />
        ) : null}
        {actions.can_withdraw ? (
          <Button variant="ghost" label={copy.withdraw.text} disabled={off} onPress={() => setPending('withdraw')} testID="filing-withdraw" />
        ) : null}
      </View>

      {pending === 'reopen'
        ? confirmBox(copy.reopenConfirm.text, copy.reopenYes.text, () => void run(reopenFiling(view.claim.id), copy.reopenDone.text))
        : null}
      {pending === 'self_file'
        ? confirmBox(copy.selfFileConfirm.text, copy.selfFileYes.text, () => void run(moveToSelfFile(view.claim.id), copy.selfFileDone.text))
        : null}
      {pending === 'withdraw'
        ? confirmBox(
            copy.withdrawConfirm.text,
            copy.withdrawYes.text,
            () => void run(withdrawClaim(view.claim.id, reason), copy.withdrawDone.text),
            <View style={filingStyles.tight} accessibilityRole="radiogroup" accessibilityLabel={copy.withdrawReason.text}>
              <AppText variant="label">{copy.withdrawReason.text}</AppText>
              <View style={filingStyles.row}>
                {REASONS.map((value) => (
                  <Chip
                    key={value}
                    label={WITHDRAW_REASON_COPY[value]}
                    selected={reason === value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: reason === value }}
                    onPress={() => setReason(value)}
                    testID={`filing-withdraw-${value}`}
                  />
                ))}
              </View>
            </View>,
          )
        : null}
      <Message tone="error" text={error} testID="filing-actions-error" />
    </View>
  );
}
