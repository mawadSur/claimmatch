'use client';

import { useEffect, useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView, JevIssueView } from '@/lib/filing/v2/contract';
import { EsignConsent } from './EsignConsent';
import { newIdempotencyKey, signPacket } from './filing-api';
import { laneTiming, lastDayLine, packetLegalName, signReadiness, typedNameMatches } from './filing-model';
import { displayValue, itemDomId, splitItems } from './packet-form';
import { ReauthPrompt } from './ReauthPrompt';
import { FieldError, FieldIssues, FormMessage, TickBox, describedBy } from './ui';

const COPY = ONE_CLICK_COPY.review;
type SignField = 'statement' | 'authorization' | 'typed';
const FIELD_IDS: Record<SignField, string> = {
  statement: 'filing-statement',
  authorization: 'filing-authorization',
  typed: 'filing-typed-name',
};

/**
 * Step 3, "Review and sign", and the one click: the packet in the official
 * form's order, the official sworn statement word for word, Lawsuit AI's
 * authorization for this one claim, E-SIGN consent the first time, the typed
 * full legal name, a sign-in-again prompt when the last password sign-in is
 * too old, and "File my claim". Agent lanes only (the self-file lane never
 * signs). Every box starts unticked; the member ticks each one.
 */
export function ReviewSignStep({
  view,
  accountEmail,
  busy,
  onView,
  refresh,
}: {
  view: ClaimFilingView;
  accountEmail: string | null;
  busy: boolean;
  onView: (view: ClaimFilingView, message: string) => void;
  refresh: (message: string) => Promise<void>;
}) {
  const [statement, setStatement] = useState(false);
  const [authorization, setAuthorization] = useState(false);
  const [typed, setTyped] = useState('');
  const [errors, setErrors] = useState<Partial<Record<SignField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [issues, setIssues] = useState<JevIssueView[]>([]);
  const [signing, setSigning] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [focus, setFocus] = useState<SignField | null>(null);
  /** Kept only while an attempt's outcome is unknown, so a retry gets the first signature back. */
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    document.getElementById(FIELD_IDS[focus])?.focus();
    setFocus(null);
  }, [focus]);

  const packet = view.packet;
  if (!packet || !packet.spec || !view.lane.agent) return null;
  const spec = packet.spec;
  const readiness = signReadiness(view);
  const legalName = packetLegalName(packet);
  const needsReauth = reauth || view.actions.needs_fresh_sign_in;
  const off = busy || signing;
  const timing = laneTiming(view.lane);
  const lastDay = lastDayLine(view.lane);
  // Details the profile already had sit in step 2's summary until "Change these details" opens them.
  const fromProfile = new Set(splitItems(packet.items).profile.map((i) => i.path));
  const changeHref = (path: string) => (fromProfile.has(path) ? '#filing-profile-title' : `#${itemDomId(path)}`);

  async function file() {
    setGeneral(null);
    setIssues([]);
    const found: Partial<Record<SignField, string>> = {};
    if (!statement) found.statement = COPY.tickStatement;
    if (view.authorization && !authorization) found.authorization = COPY.tickAuthorization;
    if (!typedNameMatches(typed, legalName)) found.typed = COPY.typedNameMismatch;
    setErrors(found);
    const first = (['statement', 'authorization', 'typed'] as const).find((f) => found[f]);
    if (first) return setFocus(first);
    if (!packet?.packet_hash || !view.authorization) return setGeneral(ONE_CLICK_COPY.loadFailed);

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
      onView(result.data, COPY.signed);
      return;
    }
    if (result.status > 0 && result.status < 500) key.current = null;
    const { code, error, issues: jevIssues } = result.error;
    if (code === 'reauth_required') {
      setReauth(true);
      setGeneral(error);
    } else if (code === 'typed_name_mismatch') {
      setErrors({ typed: error });
      setFocus('typed');
    } else if (code === 'packet_changed' || code === 'revision_conflict' || code === 'lane_unavailable' || code === 'esign_consent_required') {
      await refresh(error);
      setGeneral(error);
    } else {
      setIssues(jevIssues ?? []);
      setGeneral(error);
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {packet.items.map((item) => (
          <div key={item.path} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-ink-muted">{item.label}</dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">
                {item.kind === 'document'
                  ? ONE_CLICK_COPY.docs.count(item.proof?.documents.filter((d) => d.status === 'stored').length ?? 0, item.proof?.max_files ?? 0)
                  : displayValue(item)}
              </dd>
            </div>
            {view.actions.can_edit && item.locked === null && (
              <a href={changeHref(item.path)} className="inline-flex min-h-tap items-center text-sm font-semibold text-brand-700 underline underline-offset-2">
                {COPY.change}
                <span className="sr-only">: {item.label}</span>
              </a>
            )}
          </div>
        ))}
      </dl>

      {!readiness.canSign && (readiness.missing.length > 0 || readiness.blocking.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{COPY.notReady}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {readiness.missing.map((item) => (
              <li key={item.path}>
                <a href={`#${itemDomId(item.path)}`} className="inline-flex min-h-tap items-center underline underline-offset-2">
                  {item.label}
                </a>
              </li>
            ))}
            {readiness.blocking.map((issue) => (
              <li key={`${issue.rule_id}-${issue.field ?? ''}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {view.actions.needs_esign_consent && <EsignConsent view={view} busy={off} onAgreed={refresh} />}

      <section aria-labelledby="filing-statement-title" className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 id="filing-statement-title" className="text-sm font-bold">
          {COPY.statementTitle}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">{COPY.statementIntro}</p>
        <blockquote className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-4 border-brand-200 bg-gray-50 p-3 text-sm leading-relaxed text-ink">
          {spec.attestation_text}
        </blockquote>
        <TickBox
          id={FIELD_IDS.statement}
          checked={statement}
          onChange={setStatement}
          disabled={off || !readiness.canSign}
          describedBy={errors.statement ? 'filing-statement-error' : undefined}
          invalid={Boolean(errors.statement)}
        >
          {COPY.statementCheckbox}
        </TickBox>
        <FieldError id="filing-statement-error" message={errors.statement} />
      </section>

      {view.authorization && (
        <section aria-labelledby="filing-authorization-title" className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 id="filing-authorization-title" className="text-sm font-bold">
            {COPY.authorizationTitle}
          </h3>
          <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-ink">
            {view.authorization.text}
          </div>
          <p className="mt-1 text-xs text-ink-muted">{COPY.version(view.authorization.text_version)}</p>
          <TickBox
            id={FIELD_IDS.authorization}
            checked={authorization}
            onChange={setAuthorization}
            disabled={off || !readiness.canSign}
            describedBy={errors.authorization ? 'filing-authorization-error' : undefined}
            invalid={Boolean(errors.authorization)}
          >
            {COPY.authorizationCheckbox}
          </TickBox>
          <FieldError id="filing-authorization-error" message={errors.authorization} />
        </section>
      )}

      <div>
        <label htmlFor={FIELD_IDS.typed} className="field-label">
          {COPY.typedName}
        </label>
        {legalName && (
          <p id="filing-typed-name-hint" className="mb-1.5 text-sm text-ink-muted">
            {COPY.typedNameHint(legalName)}
          </p>
        )}
        <input
          id={FIELD_IDS.typed}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="field-input sm:max-w-md"
          value={typed}
          maxLength={200}
          disabled={off || !readiness.canSign}
          onChange={(e) => setTyped(e.target.value)}
          aria-describedby={describedBy(legalName && 'filing-typed-name-hint', 'filing-sign-hint', errors.typed && 'filing-typed-name-error')}
          aria-invalid={errors.typed ? true : undefined}
        />
        <p id="filing-sign-hint" className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          {COPY.signHint}
        </p>
        <FieldError id="filing-typed-name-error" message={errors.typed} />
      </div>

      {needsReauth && readiness.canSign && (
        <ReauthPrompt
          email={accountEmail}
          onSignedIn={async () => {
            setReauth(false);
            setGeneral(null);
            await refresh('');
          }}
        />
      )}

      <div className="rounded-xl bg-brand-50/60 p-4 text-sm leading-relaxed text-ink">
        {timing && <p>{timing}</p>}
        {lastDay && <p className="mt-1">{lastDay}</p>}
        <p className="mt-1 text-ink-muted">{ONE_CLICK_COPY.payout}</p>
      </div>

      <div>
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={file}
          disabled={off || !readiness.canSign || needsReauth || view.actions.needs_esign_consent}
        >
          <PenLine className="h-4 w-4" aria-hidden />
          {signing ? COPY.signing : COPY.fileButton}
        </button>
        {general && <FormMessage tone="error">{general}</FormMessage>}
        <FieldIssues id="filing-sign-issues" issues={issues} />
      </div>
    </div>
  );
}
