import type { ClaimFilingView, PacketItemView } from '@shared/lib/filing/v2/contract';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, CheckboxRow } from '@/components/ui';
import { filing as copy } from '@/copy/filing';

import type { FilingResult } from './api';
import { DocumentUploader } from './DocumentUploader';
import {
  buildPacketPatch,
  displayValue,
  draftFromValue,
  draftsFromItems,
  errorsByField,
  splitItems,
  unplacedIssues,
  type FieldDraft,
  type PacketPatch,
} from './form';
import { PacketFieldInput } from './PacketFieldInput';
import { FieldIssues, Message, Muted, Quote, SubHeading, ValueRow, filingStyles } from './parts';

/** Stable, so the effect below only runs when the view's items change. */
const NO_ITEMS: readonly PacketItemView[] = [];

/**
 * Step 2, "What we still need" (the web's PacketItemsStep): details missing
 * from the profile, the settlement's own questions in the official wording,
 * its choices and proof uploads, with Jev's hints next to each field.
 * Details the profile already has show as a short summary the member can
 * open and change. Saving sends only what changed.
 */
export function PacketItemsStep({
  view,
  busy,
  save,
  refresh,
}: {
  view: ClaimFilingView;
  busy: boolean;
  save: (patch: PacketPatch) => Promise<FilingResult<ClaimFilingView>>;
  refresh: (message: string) => Promise<void>;
}) {
  const packet = view.packet;
  const items = packet?.items ?? NO_ITEMS;
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>(() => draftsFromItems(items));
  const dirty = useRef(new Set<string>());
  const [editProfile, setEditProfile] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState(packet?.choices.health_consent === true);

  // A save or an upload brings a new view: take the server's value for every field the member hasn't touched.
  useEffect(() => {
    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of items) {
        if (item.kind === 'document' || dirty.current.has(item.path)) continue;
        const value = draftFromValue(item);
        if (JSON.stringify(value) !== JSON.stringify(current[item.path])) {
          next[item.path] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [items]);

  if (!packet) return null;
  const { profile, ask } = splitItems(items);
  const shown = editProfile ? items : ask;
  const off = busy || saving || packet.status !== 'open' || !view.actions.can_edit;
  const loose = unplacedIssues(packet.jev?.issues ?? [], items);

  function change(path: string, draft: FieldDraft) {
    dirty.current.add(path);
    setDrafts((current) => ({ ...current, [path]: draft }));
    setSaved('');
    if (errors[path]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
    }
  }

  async function giveHealthConsent(next: boolean) {
    setHealth(next);
    const result = await save({ health_consent: next });
    if (!result.ok) {
      setHealth(!next);
      setGeneral([result.error]);
    }
  }

  async function submit() {
    setSaved('');
    setGeneral([]);
    const built = buildPacketPatch({ items: shown, drafts, saveToProfile });
    if (!built.ok) return setErrors(built.errors);
    if (built.changed.length === 0 && !built.body.save_member_to_profile) {
      setErrors({});
      return setSaved(copy.saved.text);
    }
    setSaving(true);
    const result = await save(built.body);
    setSaving(false);
    if (!result.ok) {
      const placed = errorsByField(result, items);
      setErrors(placed.byPath);
      return setGeneral(placed.general);
    }
    for (const path of built.changed) dirty.current.delete(path);
    setErrors({});
    setSaved(copy.saved.text);
  }

  return (
    <View style={filingStyles.stack} testID="filing-need">
      <Muted>{copy.needIntro.text}</Muted>

      {general.length > 0 || loose.length > 0 ? (
        <View style={filingStyles.warning} testID="filing-need-general">
          {general.map((message) => (
            <Message key={message} tone="error" text={message} />
          ))}
          <FieldIssues issues={loose} />
        </View>
      ) : null}

      {packet.health_consent_text ? (
        <View style={filingStyles.section}>
          <SubHeading text={copy.healthTitle.text} />
          <Quote text={packet.health_consent_text} />
          <CheckboxRow
            appearance="plain"
            label={copy.healthCheckbox.text}
            checked={health}
            onChange={(next) => void giveHealthConsent(next)}
            disabled={off}
            testID="filing-health-consent"
          />
        </View>
      ) : null}

      {!editProfile && profile.length > 0 ? (
        <View style={filingStyles.section} testID="filing-from-profile">
          <SubHeading text={copy.fromProfile.text} />
          {profile.map((item) => (
            <ValueRow key={item.path} label={item.label} value={displayValue(item)} />
          ))}
          <Button variant="secondary" label={copy.changeDetails.text} onPress={() => setEditProfile(true)} disabled={off} />
        </View>
      ) : null}

      {shown.length === 0 ? <Muted>{copy.nothingToAsk.text}</Muted> : null}
      {shown.map((item) =>
        item.kind === 'document' ? (
          <DocumentUploader
            key={item.path}
            item={item}
            claimId={view.claim.id}
            disabled={off}
            error={errors[item.path] ?? null}
            onChanged={refresh}
          />
        ) : (
          <PacketFieldInput
            key={item.path}
            item={item}
            draft={drafts[item.path] ?? draftFromValue(item)}
            onChange={(draft) => change(item.path, draft)}
            error={errors[item.path] ?? null}
            disabled={off}
          />
        ),
      )}

      {packet.save_member_to_profile_available ? (
        <CheckboxRow
          appearance="plain"
          label={copy.saveToProfile.text}
          checked={saveToProfile}
          onChange={setSaveToProfile}
          disabled={off}
          testID="filing-save-to-profile"
        />
      ) : null}

      <Button
        label={saving ? copy.saving.text : copy.save.text}
        loading={saving}
        disabled={off}
        onPress={() => void submit()}
        fullWidth
        testID="filing-save"
      />
      <Message tone="success" text={saved} testID="filing-saved" />
    </View>
  );
}
