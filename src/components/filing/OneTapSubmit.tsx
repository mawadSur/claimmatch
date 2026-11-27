'use client';

import { useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView, JevIssueView } from '@/lib/filing/v2/contract';
import type { NextEasySubmit } from '@/lib/filing/one-tap';
import { ConfirmClassStep } from './ConfirmClassStep';
import { getFiling, giveEsignConsent, newIdempotencyKey, signPacket, type FilingResult } from './filing-api';
import { packetLegalName } from './filing-model';
import { displayValue } from './packet-form';
import type { PacketPatch } from './packet-form';
import { PacketItemsStep } from './PacketItemsStep';
import { ReauthPrompt } from './ReauthPrompt';
import { FieldIssues, FormMessage } from './ui';

const COPY = ONE_CLICK_COPY.oneTap;

/**
 * Compact 1-tap Easy submit when every required field is already filled:
 * collapsed summary, inline legal disclosure, one primary submit. "Edit
 * details" opens the full packet form. Class confirmation, E-SIGN consent
 * of the current version, and authorization are accepted by that one tap.
 */
export function OneTapSubmit({
  view,
  accountEmail,
  reauthWithGoogle = false,
  reauthWithApple = false,
  busy,
  save,
  refresh,
  onView,
}: {
  view: ClaimFilingView;
  accountEmail: string | null;
  reauthWithGoogle?: boolean;
  reauthWithApple?: boolean;
  busy: boolean;
  save: (patch: PacketPatch) => Promise<FilingResult<ClaimFilingView>>;
  refresh: (message: string) => Promise<void>;
  onView: (view: ClaimFilingView, message: string) => void;
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
        setGeneral(confirmed.error.error);
        return;
      }
      current = confirmed.data;
      currentPacket = current.packet;
    }

    if (current.actions.needs_esign_consent || !current.esign.consented) {
      const consent = await giveEsignConsent(current.claim.id, current.esign.text_version);
      if (!consent.ok) {
        setGeneral(consent.error.error);
        return;
      }
    }

    const latest = await getFiling(current.claim.id);
    if (!latest.ok) {
      setGeneral(latest.error.error);
      return;
    }
    current = latest.data;
    currentPacket = current.packet;
    if (!currentPacket?.packet_hash || !currentPacket.spec || !current.authorization) {
      setGeneral(ONE_CLICK_COPY.loadFailed);
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
      onView(result.data, ONE_CLICK_COPY.review.signed);
      return;
    }
    if (result.status > 0 && result.status < 500) key.current = null;
    const { code, error, issues: jevIssues } = result.error;
    if (code === 'reauth_required') {
      setReauth(true);
      setGeneral(error);
    } else if (code === 'packet_changed' || code === 'revision_conflict' || code === 'lane_unavailable' || code === 'esign_consent_required') {
      await refresh(error);
      setGeneral(error);
    } else {
      setIssues(jevIssues ?? []);
      setGeneral(error);
    }
  }

  return (
    <div id="one-click" className="scroll-mt-24 space-y-4">
      <section aria-labelledby="filing-one-tap-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
        <h2 id="filing-one-tap-title" className="text-lg font-bold">
          {COPY.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>

        <dl className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
          {packet.items.map((item) => (
            <div key={item.path} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-ink-muted">{item.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">
                  {item.kind === 'document'
                    ? ONE_CLICK_COPY.docs.count(
                        item.proof?.documents.filter((doc) => doc.status === 'stored').length ?? 0,
                        item.proof?.max_files ?? 0,
                      )
                    : displayValue(item)}
                </dd>
              </div>
            </div>
          ))}
        </dl>

        <details className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {COPY.classTitle}
          </summary>
          <blockquote className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {spec.class_definition.text}
          </blockquote>
        </details>
        <details className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {ONE_CLICK_COPY.review.statementTitle}
          </summary>
          <blockquote className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {spec.attestation_text}
          </blockquote>
        </details>
        {view.authorization && (
          <details className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {ONE_CLICK_COPY.review.authorizationTitle}
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {view.authorization.text}
            </div>
          </details>
        )}
        {view.actions.needs_esign_consent && (
          <details className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {ONE_CLICK_COPY.esign.title}
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {view.esign.text}
            </div>
          </details>
        )}

        <button
          type="button"
          className="mt-4 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? COPY.hide : COPY.edit}
        </button>
        {editing && (
          <div className="mt-4 space-y-5">
            <ConfirmClassStep view={view} busy={off} save={save} />
            <PacketItemsStep view={view} busy={off} save={save} refresh={refresh} />
          </div>
        )}

        {legalName && <p className="mt-4 text-sm leading-relaxed text-ink">{COPY.disclosure(legalName)}</p>}

        {needsReauth && (
          <ReauthPrompt
            email={accountEmail}
            google={reauthWithGoogle}
            apple={reauthWithApple}
            onSignedIn={async () => {
              setReauth(false);
              setGeneral(null);
              await refresh('');
            }}
          />
        )}

        <button
          type="button"
          className="btn-primary mt-4 w-full sm:w-auto"
          onClick={() => void submit()}
          id="filing-one-tap-submit"
          disabled={signing || off || needsReauth || !legalName || !view.authorization}
          aria-busy={signing}
        >
          <PenLine className="h-4 w-4" aria-hidden />
          {signing ? COPY.submitting : COPY.submit}
        </button>
        {general && <FormMessage tone="error">{general}</FormMessage>}
        <FieldIssues id="filing-one-tap-issues" issues={issues} />
      </section>
    </div>
  );
}

export function NextEasySubmitCta({ next }: { next: NextEasySubmit }) {
  return (
    <p className="mt-4">
      <a href={next.href} className="btn-primary inline-flex w-full justify-center sm:w-auto">
        {COPY.next}
      </a>
      <span className="mt-2 block text-sm text-ink-muted">{COPY.nextHint(next.title)}</span>
    </p>
  );
}
