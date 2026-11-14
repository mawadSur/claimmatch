'use client';

import { useEffect, useRef, useState } from 'react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView, PacketItemView } from '@/lib/filing/v2/contract';
import { DocumentUploader } from './DocumentUploader';
import type { FilingResult } from './filing-api';
import { PacketFieldInput } from './PacketFieldInput';
import {
  buildPacketPatch,
  displayValue,
  draftFromValue,
  draftsFromItems,
  errorsByField,
  firstErrorPath,
  itemDomId,
  splitItems,
  unplacedIssues,
  type FieldDraft,
  type PacketPatch,
} from './packet-form';
import { FieldIssues, FormMessage, TickBox } from './ui';

const COPY = ONE_CLICK_COPY.need;
/** Stable, so the effect below only runs when the view's items change. */
const NO_ITEMS: readonly PacketItemView[] = [];

/**
 * Step 2, "What we still need": details missing from the profile, the
 * settlement's questions in the official wording, its choices and proof
 * uploads, with Jev's hints next to each field. Details the profile already
 * has show as a short summary the member can open and change. Saving sends
 * only what changed; errors land next to their fields and focus moves to the
 * first one.
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
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [health, setHealth] = useState(packet?.choices.health_consent === true);
  const generalRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!focusPath) return;
    if (focusPath === '__general') generalRef.current?.focus();
    else document.getElementById(itemDomId(focusPath))?.focus();
    setFocusPath(null);
  }, [focusPath]);

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
      setGeneral([result.error.error]);
      setFocusPath('__general');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved('');
    setGeneral([]);
    const built = buildPacketPatch({ items: shown, drafts, saveToProfile });
    if (!built.ok) {
      setErrors(built.errors);
      setFocusPath(firstErrorPath(items, built.errors));
      return;
    }
    const patch = built.body;
    if (built.changed.length === 0 && !patch.save_member_to_profile) {
      setErrors({});
      setSaved(COPY.saved);
      return;
    }
    setSaving(true);
    const result = await save(patch);
    setSaving(false);
    if (!result.ok) {
      const placed = errorsByField(result.error, items);
      setErrors(placed.byPath);
      setGeneral(placed.general);
      setFocusPath(firstErrorPath(items, placed.byPath) ?? (placed.general.length ? '__general' : null));
      return;
    }
    for (const path of built.changed) dirty.current.delete(path);
    setErrors({});
    setSaved(COPY.saved);
  }

  const field = (item: PacketItemView) =>
    item.kind === 'document' ? (
      <DocumentUploader key={item.path} item={item} claimId={view.claim.id} disabled={off} error={errors[item.path] ?? null} onChanged={refresh} />
    ) : (
      <PacketFieldInput
        key={item.path}
        item={item}
        draft={drafts[item.path] ?? draftFromValue(item)}
        onChange={(draft) => change(item.path, draft)}
        error={errors[item.path] ?? null}
        disabled={off}
      />
    );

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>

      {(general.length > 0 || loose.length > 0) && (
        <div ref={generalRef} tabIndex={-1} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 focus:outline-none">
          {general.map((message) => (
            <FormMessage key={message} tone="error">
              {message}
            </FormMessage>
          ))}
          <FieldIssues id="filing-packet-issues" issues={loose} />
        </div>
      )}

      {packet.health_consent_text && (
        <section aria-labelledby="filing-health-title" className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 id="filing-health-title" className="text-sm font-bold">
            {COPY.healthTitle}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{packet.health_consent_text}</p>
          <TickBox id="filing-health-consent" checked={health} onChange={giveHealthConsent} disabled={off}>
            {COPY.healthCheckbox}
          </TickBox>
        </section>
      )}

      {!editProfile && profile.length > 0 && (
        <section aria-labelledby="filing-profile-title" className="rounded-xl bg-gray-50 p-4">
          <h3 id="filing-profile-title" className="text-sm font-bold">
            {COPY.fromProfile}
          </h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {profile.map((item) => (
              <div key={item.path}>
                <dt className="text-xs font-semibold text-ink-muted">{item.label}</dt>
                <dd className="break-words text-sm text-ink">{displayValue(item)}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="btn-secondary mt-3 !py-2 text-sm" onClick={() => setEditProfile(true)} disabled={off}>
            {COPY.change}
          </button>
        </section>
      )}

      {shown.length === 0 ? <p className="text-sm text-ink-muted">{COPY.nothingToAsk}</p> : shown.map(field)}

      {packet.save_member_to_profile_available && (
        <TickBox id="filing-save-to-profile" checked={saveToProfile} onChange={setSaveToProfile} disabled={off}>
          {COPY.saveToProfile}
        </TickBox>
      )}

      <div>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={off}>
          {saving ? COPY.saving : COPY.save}
        </button>
        {saved && <FormMessage tone="success">{saved}</FormMessage>}
      </div>
    </form>
  );
}
