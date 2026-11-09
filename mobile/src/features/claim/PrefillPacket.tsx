import type { PacketProfile } from '@shared/lib/claim-screen';
import { packetFieldOrder, type PacketFieldKey } from '@shared/lib/form-field-order';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type TextInputProps } from 'react-native';

import { AppText, Button, CheckboxRow, Notice, TextField } from '@/components/ui';
import { Copy } from '@/components/ui/icons';
import { claim as copy, copyFieldLabel } from '@/copy/claim';
import { userFacingError } from '@/data/errors';
import { useSaveSettings, type SettingsInput } from '@/data/profile';
import { StatePickerField } from '@/features/shared';
import { now } from '@/lib/clock';
import { useConfig } from '@/providers/ConfigProvider';
import { colors, radii, space } from '@/theme/tokens';

type PacketFields = Record<PacketFieldKey, string>;

const FIELD_LABELS: Record<PacketFieldKey, string> = {
  full_name: copy.fullName.text,
  email: copy.email.text,
  phone: copy.phone.text,
  address_line1: copy.addressLine1.text,
  address_line2: copy.addressLine2.text,
  city: copy.city.text,
  state: copy.state.text,
};

/** Keyboard and autofill hints per field (the web's input type and autoComplete). */
const FIELD_INPUT: Record<Exclude<PacketFieldKey, 'state'>, Partial<TextInputProps>> = {
  full_name: { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' },
  email: {
    autoComplete: 'email',
    textContentType: 'emailAddress',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
  },
  phone: { autoComplete: 'tel', textContentType: 'telephoneNumber', keyboardType: 'phone-pad' },
  address_line1: { autoComplete: 'address-line1', textContentType: 'streetAddressLine1' },
  address_line2: { autoComplete: 'address-line2', textContentType: 'streetAddressLine2' },
  city: { autoComplete: 'postal-address-locality', textContentType: 'addressCity' },
};

/**
 * "Copy all" (formatPacketBlock in src/components/claims/PrefillPacket.tsx):
 * labeled name, email and phone lines, then the address lines and "City, ST".
 */
export function formatPacketBlock(fields: PacketFields): string {
  const address = [fields.address_line1, fields.address_line2].filter(Boolean).join('\n');
  const cityLine = [fields.city, fields.state].filter(Boolean).join(', ');
  return [
    `${copy.fullName.text}: ${fields.full_name}`,
    `${copy.email.text}: ${fields.email}`,
    `${copy.phone.text}: ${fields.phone}`,
    address,
    cityLine,
  ]
    .filter((line) => line.trim() !== '')
    .join('\n');
}

const COPIED_FOR_MS = 1600;

/**
 * Copy-ready claim details from the profile (src/components/claims/PrefillPacket.tsx),
 * in the official form's order when FORM_FIELD_ORDER_ENABLED is on. Each value
 * copies on its own, or all at once; edits save through POST /api/settings,
 * the address only with consent. Never writes claims: ClaimMatch never files.
 */
export function PrefillPacket({
  profile,
  formFieldOrder,
}: {
  profile: PacketProfile | null;
  formFieldOrder?: string[] | null;
}) {
  const { isFlagOn } = useConfig();
  const saveSettings = useSaveSettings();
  const [fields, setFields] = useState<PacketFields>(() => ({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    address_line1: profile?.address_line1 || '',
    address_line2: profile?.address_line2 || '',
    city: profile?.city || '',
    state: profile?.state || '',
  }));
  const [consent, setConsent] = useState(Boolean(profile?.prefill_consent_at));
  const [copied, setCopied] = useState<PacketFieldKey | 'all' | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const consented = Boolean(profile?.prefill_consent_at);
  const needsConsent = !consented && !consent;
  const hasAddress = Boolean(fields.address_line1 || fields.city);
  const order = packetFieldOrder(formFieldOrder, isFlagOn('FORM_FIELD_ORDER_ENABLED'));

  function update(key: PacketFieldKey, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    // "Saved" describes the details as they were saved, not later edits.
    setSaveState((current) => (current === 'saving' ? current : 'idle'));
  }

  async function copyValue(what: PacketFieldKey | 'all', value: string) {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      setCopied(null);
      return;
    }
    setCopied(what);
    AccessibilityInfo.announceForAccessibility(what === 'all' ? copy.copiedAll.text : copy.copied.text);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied((current) => (current === what ? null : current)), COPIED_FOR_MS);
  }

  async function saveDetails() {
    if (saveState === 'saving') return;
    if (hasAddress && needsConsent) {
      setSaveError(copy.consentNeeded.text);
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    const patch: SettingsInput = { full_name: fields.full_name, phone: fields.phone, state: fields.state };
    if (hasAddress && (consent || consented)) {
      patch.address_line1 = fields.address_line1;
      patch.address_line2 = fields.address_line2;
      patch.city = fields.city;
      if (!consented) patch.prefill_consent_at = now().toISOString();
    }
    try {
      await saveSettings.mutateAsync(patch);
      setSaveState('saved');
    } catch (caught) {
      setSaveError(userFacingError(caught)?.message ?? '');
      setSaveState('error');
    }
  }

  function copyButton(key: PacketFieldKey) {
    return (
      <Button
        label={copied === key ? copy.copied.text : copy.copy.text}
        variant="secondary"
        accessibilityLabel={copyFieldLabel(FIELD_LABELS[key])}
        disabled={!fields[key]}
        onPress={() => void copyValue(key, fields[key])}
        style={styles.copy}
        testID={`claim-packet-copy-${key}`}
      />
    );
  }

  return (
    <View style={styles.packet} testID="claim-prefill-packet">
      <View style={styles.text}>
        <AppText variant="label" accessibilityRole="header">
          {copy.packetTitle.text}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {copy.packetNote.text}
        </AppText>
      </View>
      <Button
        label={copied === 'all' ? copy.copiedAll.text : copy.copyAll.text}
        variant="secondary"
        icon={Copy}
        onPress={() => void copyValue('all', formatPacketBlock(fields))}
        style={styles.start}
        testID="claim-packet-copy-all"
      />
      {order.map((key) =>
        key === 'state' ? (
          <StatePickerField
            key={key}
            label={FIELD_LABELS.state}
            placeholder={copy.selectState.text}
            value={fields.state}
            onChange={(code) => update('state', code)}
            trailing={copyButton(key)}
            testID="claim-packet-state"
          />
        ) : (
          <TextField
            key={key}
            label={FIELD_LABELS[key]}
            value={fields[key]}
            onChangeText={(value) => update(key, value)}
            trailing={copyButton(key)}
            testID={`claim-packet-${key}`}
            {...FIELD_INPUT[key]}
          />
        ),
      )}
      {hasAddress && !consented ? (
        <CheckboxRow
          appearance="plain"
          label={copy.saveAddressConsent.text}
          checked={consent}
          onChange={setConsent}
          testID="claim-packet-consent"
        />
      ) : null}
      <Button
        label={
          saveState === 'saving' ? copy.saving.text : saveState === 'saved' ? copy.saved.text : copy.saveDetails.text
        }
        variant="secondary"
        loading={saveState === 'saving'}
        onPress={() => void saveDetails()}
        style={styles.start}
        testID="claim-packet-save"
      />
      {saveState === 'error' && saveError ? <Notice tone="error" body={saveError} testID="claim-packet-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  packet: {
    gap: space[4],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.background,
  },
  text: {
    gap: space[1],
  },
  start: {
    alignSelf: 'flex-start',
  },
  copy: {
    // Wide enough for "Copied" too, so the field does not jump when the label changes.
    minWidth: 88,
    paddingHorizontal: space[3],
  },
});
