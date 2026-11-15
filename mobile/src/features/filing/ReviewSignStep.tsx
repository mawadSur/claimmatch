import type { ClaimFilingView, JevIssueView } from '@shared/lib/filing/v2/contract';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, CheckboxRow, FieldError, TextField } from '@/components/ui';
import { PenLine } from '@/components/ui/icons';
import { docsCountText, filing as copy, typedNameHintText, versionText } from '@/copy/filing';

import { newIdempotencyKey, signPacket } from './api';
import { displayValue } from './form';
import { laneTiming, lastDayLine, packetLegalName, signReadiness, typedNameMatches } from './model';
import { FieldIssues, Message, Muted, Quote, SubHeading, ValueRow, filingStyles } from './parts';
import { EsignConsent, ReauthPrompt } from './SignHelpers';
import type { OnFilingView } from './use-one-click';

type SignField = 'statement' | 'authorization' | 'typed';

/** Jev's results before signing: what is still missing and what stops the signature. */
export function JevResults({ view }: { view: ClaimFilingView }) {
  const readiness = signReadiness(view);
  if (readiness.canSign || (readiness.missing.length === 0 && readiness.blocking.length === 0)) return null;
  return (
    <View style={filingStyles.warning} testID="filing-jev-results">
      <AppText variant="bodyStrong" color="warning">
        {copy.reviewNotReady.text}
      </AppText>
      {readiness.missing.map((item) => (
        <AppText key={item.path} variant="caption" color="warning">{`• ${item.label}`}</AppText>
      ))}
      {readiness.blocking.map((issue) => (
        <AppText key={`${issue.rule_id}-${issue.field ?? ''}`} variant="caption" color="warning">{`• ${issue.message}`}</AppText>
      ))}
    </View>
  );
}

/**
 * Step 3, "Review and sign", and the one click (the web's ReviewSignStep):
 * the packet in the official form's order, Jev's results, E-SIGN consent the
 * first time, the official sworn statement word for word, Lawsuit AI's
 * authorization for this one claim, the typed full legal name, the sign-in
 * again prompt when the last password sign-in is too old, and "File my
 * claim". Every box starts unticked; the member ticks each one.
 */
export function ReviewSignStep({
  view,
  busy,
  onView,
  refresh,
  onChange,
}: {
  view: ClaimFilingView;
  busy: boolean;
  onView: OnFilingView;
  refresh: (message: string) => Promise<void>;
  /** "Change": back to step 2. */
  onChange: () => void;
}) {
  const [statement, setStatement] = useState(false);
  const [authorization, setAuthorization] = useState(false);
  const [typed, setTyped] = useState('');
  const [errors, setErrors] = useState<Partial<Record<SignField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [issues, setIssues] = useState<JevIssueView[]>([]);
  const [signing, setSigning] = useState(false);
  const [reauth, setReauth] = useState(false);
  /** Kept only while an attempt's outcome is unknown, so a retry gets the first signature back. */
  const key = useRef<string | null>(null);

  const packet = view.packet;
  if (!packet || !packet.spec || !view.lane.agent) return null;
  const spec = packet.spec;
  const readiness = signReadiness(view);
  const legalName = packetLegalName(packet);
  const needsReauth = reauth || view.actions.needs_fresh_sign_in;
  const off = busy || signing;
  const timing = laneTiming(view.lane);
  const lastDay = lastDayLine(view.lane);

  async function file() {
    setGeneral(null);
    setIssues([]);
    const found: Partial<Record<SignField, string>> = {};
    if (!statement) found.statement = copy.tickStatement.text;
    if (view.authorization && !authorization) found.authorization = copy.tickAuthorization.text;
    if (!typedNameMatches(typed, legalName)) found.typed = copy.typedNameMismatch.text;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!packet?.packet_hash || !view.authorization) return setGeneral(copy.loadFailed.text);

    key.current ??= newIdempotencyKey();
    setSigning(true);
    const result = await signPacket(
      view.claim.id,
      {
        packet_hash: packet.packet_hash,
        revision: packet.revision,
        spec_id: spec.id,
        spec_version: spec.version,
        typed_name: typed.trim(),
        attestation_accepted: true,
        authorization_accepted: true,
        authorization_text_version: view.authorization.text_version,
      },
      key.current,
    );
    setSigning(false);
    if (result.ok) {
      key.current = null;
      onView(result.data, copy.signed.text);
      return;
    }
    if (result.status > 0 && result.status < 500) key.current = null;
    const { code, error } = result;
    if (code === 'reauth_required') {
      setReauth(true);
      setGeneral(error);
    } else if (code === 'typed_name_mismatch') {
      setErrors({ typed: error });
    } else if (code === 'packet_changed' || code === 'revision_conflict' || code === 'lane_unavailable' || code === 'esign_consent_required') {
      await refresh(error);
      setGeneral(error);
    } else {
      setIssues(result.issues ?? []);
      setGeneral(error);
    }
  }

  const stored = (path: string) =>
    packet.items.find((i) => i.path === path)?.proof?.documents.filter((d) => d.status === 'stored').length ?? 0;

  return (
    <View style={filingStyles.stack} testID="filing-review">
      <Muted>{copy.reviewIntro.text}</Muted>
      <View>
        {packet.items.map((item) => (
          <ValueRow
            key={item.path}
            label={item.label}
            value={item.kind === 'document' ? docsCountText(stored(item.path), item.proof?.max_files ?? 0) : displayValue(item)}
            trailing={
              view.actions.can_edit && item.locked === null ? (
                <Button variant="ghost" label={copy.reviewChange.text} accessibilityLabel={`${copy.reviewChange.text}: ${item.label}`} onPress={onChange} />
              ) : undefined
            }
          />
        ))}
      </View>

      <JevResults view={view} />

      {view.actions.needs_esign_consent ? <EsignConsent view={view} busy={off} onAgreed={refresh} /> : null}

      <View style={filingStyles.section}>
        <SubHeading text={copy.statementTitle.text} />
        <Muted>{copy.statementIntro.text}</Muted>
        <Quote text={spec.attestation_text} testID="filing-statement-text" />
        <CheckboxRow
          appearance="plain"
          label={copy.statementCheckbox.text}
          checked={statement}
          onChange={setStatement}
          disabled={off || !readiness.canSign}
          testID="filing-statement"
        />
        <FieldError message={errors.statement} />
      </View>

      {view.authorization ? (
        <View style={filingStyles.section}>
          <SubHeading text={copy.authorizationTitle.text} />
          <Quote text={view.authorization.text} />
          <Muted>{versionText(view.authorization.text_version)}</Muted>
          <CheckboxRow
            appearance="plain"
            label={copy.authorizationCheckbox.text}
            checked={authorization}
            onChange={setAuthorization}
            disabled={off || !readiness.canSign}
            testID="filing-authorization"
          />
          <FieldError message={errors.authorization} />
        </View>
      ) : null}

      <TextField
        label={copy.typedName.text}
        hint={[legalName ? typedNameHintText(legalName) : null, copy.signHint.text].filter(Boolean).join(' ')}
        value={typed}
        onChangeText={setTyped}
        error={errors.typed}
        disabled={off || !readiness.canSign}
        autoComplete="off"
        autoCorrect={false}
        autoCapitalize="words"
        maxLength={200}
        testID="filing-typed-name"
      />

      {needsReauth && readiness.canSign ? (
        <ReauthPrompt
          onSignedIn={async () => {
            setReauth(false);
            setGeneral(null);
            await refresh('');
          }}
        />
      ) : null}

      <View style={filingStyles.tight}>
        {timing ? <AppText variant="caption">{timing}</AppText> : null}
        {lastDay ? <AppText variant="caption">{lastDay}</AppText> : null}
        <Muted>{copy.payout.text}</Muted>
      </View>

      <Button
        label={signing ? copy.signing.text : copy.fileButton.text}
        icon={PenLine}
        loading={signing}
        disabled={off || !readiness.canSign || needsReauth || view.actions.needs_esign_consent}
        onPress={() => void file()}
        fullWidth
        testID="filing-file"
      />
      <Message tone="error" text={general} testID="filing-sign-error" />
      <FieldIssues issues={issues} testID="filing-sign-issues" />
    </View>
  );
}
