import type { ClaimFilingView, JevIssueView } from '@shared/lib/filing/v2/contract';
import type { NextEasySubmit } from '@shared/lib/filing/one-tap';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText, Button } from '@/components/ui';
import { PenLine } from '@/components/ui/icons';
import { docsCountText, filing as copy, oneTapDisclosureText, oneTapNextHintText } from '@/copy/filing';
import { claimHref, claimRoute } from '@/features/shared';

import { getFiling, giveEsignConsent, newIdempotencyKey, signPacket, type FilingResult } from './api';
import { ConfirmClassStep } from './ConfirmClassStep';
import { displayValue } from './form';
import type { PacketPatch } from './form';
import { packetLegalName } from './model';
import { PacketItemsStep } from './PacketItemsStep';
import { FieldIssues, Message, Muted, Quote, SubHeading, ValueRow, filingStyles } from './parts';
import { ReauthPrompt } from './SignHelpers';
import type { OnFilingView } from './use-one-click';

export function OneTapSubmit({
  view,
  busy,
  save,
  refresh,
  onView,
}: {
  view: ClaimFilingView;
  busy: boolean;
  save: (patch: PacketPatch) => Promise<FilingResult<ClaimFilingView>>;
  refresh: (message: string) => Promise<void>;
  onView: OnFilingView;
}) {
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [general, setGeneral] = useState<string | null>(null);
  const [issues, setIssues] = useState<JevIssueView[]>([]);
  const key = useRef<string | null>(null);
  const packet = view.packet;
  if (!packet || !packet.spec || !view.lane.agent) return null;

  const spec = packet.spec;
  const legalName = packetLegalName(packet);
  const needsReauth = reauth || view.actions.needs_fresh_sign_in;
  const off = busy || signing;

  async function submit() {
    if (signing || !legalName || !view.authorization) return;
    setGeneral(null);
    setIssues([]);
    let current = view;
    let currentPacket = current.packet;
    if (!currentPacket?.spec) return;

    if (!currentPacket.choices.class_definition_confirmed) {
      const confirmed = await save({ class_definition_confirmed: true });
      if (!confirmed.ok) {
        setGeneral(confirmed.error);
        return;
      }
      current = confirmed.data;
      currentPacket = current.packet;
    }

    if (current.actions.needs_esign_consent || !current.esign.consented) {
      const consent = await giveEsignConsent(current.claim.id, current.esign.text_version);
      if (!consent.ok) {
        setGeneral(consent.error);
        return;
      }
    }

    const latest = await getFiling(current.claim.id);
    if (!latest.ok) {
      setGeneral(latest.error);
      return;
    }
    current = latest.data;
    currentPacket = current.packet;
    if (!currentPacket?.packet_hash || !currentPacket.spec || !current.authorization) {
      setGeneral(copy.loadFailed.text);
      return;
    }

    key.current ??= newIdempotencyKey();
    setSigning(true);
    const result = await signPacket(
      current.claim.id,
      {
        packet_hash: currentPacket.packet_hash,
        revision: currentPacket.revision,
        spec_id: currentPacket.spec.id,
        spec_version: currentPacket.spec.version,
        typed_name: legalName,
        attestation_accepted: true,
        authorization_accepted: true,
        authorization_text_version: current.authorization.text_version,
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
    if (result.code === 'reauth_required') {
      setReauth(true);
      setGeneral(result.error);
    } else if (
      result.code === 'packet_changed' ||
      result.code === 'revision_conflict' ||
      result.code === 'lane_unavailable' ||
      result.code === 'esign_consent_required'
    ) {
      await refresh(result.error);
      setGeneral(result.error);
    } else {
      setIssues(result.issues ?? []);
      setGeneral(result.error);
    }
  }

  return (
    <View style={filingStyles.section} testID="filing-one-tap">
      <AppText variant="heading" accessibilityRole="header">
        {copy.oneTapTitle.text}
      </AppText>
      <Muted>{copy.oneTapIntro.text}</Muted>
      {packet.items.map((item) => (
        <ValueRow
          key={item.path}
          label={item.label}
          value={
            item.kind === 'document'
              ? docsCountText(
                  item.proof?.documents.filter((doc) => doc.status === 'stored').length ?? 0,
                  item.proof?.max_files ?? 0,
                )
              : displayValue(item)
          }
        />
      ))}
      <SubHeading text={copy.oneTapClassTitle.text} />
      <Quote text={spec.class_definition.text} />
      <SubHeading text={copy.statementTitle.text} />
      <Quote text={spec.attestation_text} />
      {view.authorization ? (
        <>
          <SubHeading text={copy.authorizationTitle.text} />
          <Quote text={view.authorization.text} />
        </>
      ) : null}
      <Button
        label={editing ? copy.oneTapHide.text : copy.oneTapEdit.text}
        variant="secondary"
        onPress={() => setEditing((open) => !open)}
        testID="filing-one-tap-edit"
      />
      {editing ? (
        <>
          <ConfirmClassStep view={view} busy={off} save={save} />
          <PacketItemsStep view={view} busy={off} save={save} refresh={refresh} />
        </>
      ) : null}
      {legalName ? <AppText variant="caption">{oneTapDisclosureText(legalName)}</AppText> : null}
      {needsReauth ? (
        <ReauthPrompt
          onSignedIn={async () => {
            setReauth(false);
            setGeneral(null);
            await refresh('');
          }}
        />
      ) : null}
      <Button
        label={signing ? copy.oneTapSubmitting.text : copy.oneTapSubmit.text}
        loading={signing}
        disabled={signing || off || needsReauth || !legalName || !view.authorization}
        onPress={() => void submit()}
        fullWidth
        icon={PenLine}
        testID="filing-one-tap-submit"
      />
      <Message tone="error" text={general} />
      <FieldIssues issues={issues} testID="filing-one-tap-issues" />
    </View>
  );
}

export function NextEasySubmitCta({ next }: { next: NextEasySubmit }) {
  const router = useRouter();
  return (
    <View testID="filing-next-easy-submit">
      <Button
        label={copy.oneTapNext.text}
        onPress={() => router.push(claimRoute(claimHref(next.slug)))}
        fullWidth
        testID="filing-next-easy-submit-go"
      />
      <Muted>{oneTapNextHintText(next.title)}</Muted>
    </View>
  );
}
