'use client';

import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { OFFICIAL_FORM_CHALLENGES } from '@/lib/filing/v2/contract';
import { RecordResultRequestSchema, ResolveJobRequestSchema, type DeskPacketView } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, EVIDENCE_MIME_TYPES, EVIDENCE_TYPES_TEXT, staffJson, staffPaths, uploadEvidence, type ApiError, type FieldIssue } from './api';
import { formatBytes } from './format';
import { zodIssues } from './forms';
import { CHALLENGE_LABEL, REASON_SUGGESTIONS, RESOLUTIONS, RESULT_OUTCOMES, type Resolution, type ResultOutcome } from './labels';
import { AreaField, ErrorNote, FieldIssues, IconButton, Notice, SelectField, TextField } from './ui';

/** Reason codes are lowercase identifiers: typing is normalized as you go. */
export function normalizeReasonCode(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64);
}

export function ReasonCodeField({
  id,
  label,
  value,
  onChange,
  suggestions,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>{label}</label>
      <input
        id={id}
        list={`${id}-suggestions`}
        className="field-input py-2 font-mono text-sm"
        value={value}
        disabled={disabled}
        placeholder={suggestions[0] ?? 'reason_code'}
        onChange={(e) => onChange(normalizeReasonCode(e.target.value))}
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p className="mt-1 text-xs text-ink-muted">A short code, for example {suggestions.slice(0, 2).join(' or ')}.</p>
    </div>
  );
}

interface Uploaded {
  documentId: string;
  /** Shown here only; never sent. */
  name: string;
  size: number;
}

function EvidenceUploader({ jobId, files, onChange, disabled }: { jobId: string; files: Uploaded[]; onChange: (files: Uploaded[]) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inputId = `evidence-${jobId}`;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const res = await uploadEvidence(jobId, file);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChange([...files, { documentId: res.data.documentId, name: file.name, size: file.size }]);
  }

  return (
    <div className="space-y-2">
      <label className="field-label text-xs" htmlFor={inputId}>Confirmation screenshot ({EVIDENCE_TYPES_TEXT}, up to 5)</label>
      <input
        id={inputId}
        type="file"
        accept={EVIDENCE_MIME_TYPES.join(',')}
        disabled={disabled || busy || files.length >= 5}
        className="block text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
      {busy ? <p className="text-xs text-ink-muted">Uploading…</p> : null}
      <ErrorNote error={error} />
      {files.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={f.documentId} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden />
              <span className="min-w-0 truncate">{f.name}</span>
              <span className="text-xs text-ink-muted">{formatBytes(f.size)}</span>
              <IconButton label="Do not use this file" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const CHALLENGE_OPTIONS = OFFICIAL_FORM_CHALLENGES.map((value) => ({ value, label: CHALLENGE_LABEL[value] }));

/** Builds the result body; the contract schema has the last word. */
export function buildResultBody(input: {
  outcome: ResultOutcome;
  confirmationNumber: string;
  evidenceIds: string[];
  reasonCode: string;
  challenge: string;
  notes: string;
}) {
  const reason = input.outcome === 'stopped_at_challenge' ? input.challenge : input.reasonCode;
  return {
    outcome: input.outcome,
    confirmation_number: input.outcome === 'filed' && input.confirmationNumber.trim() ? input.confirmationNumber.trim() : null,
    evidence_document_ids: input.outcome === 'filed' || input.outcome === 'rejected' ? input.evidenceIds : [],
    reason_code: reason ? reason : null,
    notes: input.notes.trim() ? input.notes.trim() : null,
  };
}

/** What the lock holder records once they are done on the official site. */
export function DeskResultForm({ view, onDone }: { view: DeskPacketView; onDone: (message: string) => void }) {
  const [outcome, setOutcome] = useState<ResultOutcome | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [evidence, setEvidence] = useState<Uploaded[]>([]);
  const [reasonCode, setReasonCode] = useState('');
  const [challenge, setChallenge] = useState<string>(OFFICIAL_FORM_CHALLENGES[0]);
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const jobId = view.job.id;
  const blocked = view.checks.outcome === 'block';
  const needsReason = outcome === 'rejected' || outcome === 'needs_attention' || outcome === 'needs_member';

  async function submit() {
    if (!outcome) return;
    setIssues([]);
    setError(null);
    const local: FieldIssue[] = [];
    if (outcome === 'filed' && evidence.length === 0) local.push({ path: 'evidence_document_ids', message: 'Upload a screenshot of the confirmation page first' });
    if (needsReason && !reasonCode) local.push({ path: 'reason_code', message: 'Say why' });
    if (outcome === 'filed' && blocked) local.push({ path: 'outcome', message: 'Jev blocks this claim: it must not be submitted' });
    const parsed = RecordResultRequestSchema.safeParse(
      buildResultBody({ outcome, confirmationNumber, evidenceIds: evidence.map((e) => e.documentId), reasonCode, challenge, notes }),
    );
    if (!parsed.success) local.push(...zodIssues(parsed.error));
    if (local.length > 0 || !parsed.success) {
      setIssues(local);
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.jobResult(jobId), AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone('Result saved.');
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Record the result</h3>
      <fieldset className="space-y-2">
        <legend className="sr-only">What happened</legend>
        {RESULT_OUTCOMES.map((o) => {
          const off = o.value === 'filed' && blocked;
          return (
            <label key={o.value} className={`flex gap-3 rounded-lg border p-3 text-sm ${outcome === o.value ? 'border-brand-300 bg-brand-50' : 'border-gray-100'} ${off ? 'opacity-50' : ''}`}>
              <input type="radio" name={`outcome-${jobId}`} value={o.value} checked={outcome === o.value} disabled={off || busy} onChange={() => setOutcome(o.value)} className="mt-0.5" />
              <span>
                <span className="font-semibold text-ink">{o.label}</span>
                <span className="block text-xs text-ink-muted">{o.help}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {outcome === 'filed' ? (
        <TextField id={`confirmation-${jobId}`} label="Confirmation number (if the site showed one)" mono value={confirmationNumber} maxLength={100} disabled={busy} onChange={setConfirmationNumber} hint="Without one, the claim shows as filed and waiting for the administrator’s number." />
      ) : null}
      {outcome === 'filed' || outcome === 'rejected' ? (
        <EvidenceUploader jobId={jobId} files={evidence} onChange={setEvidence} disabled={busy} />
      ) : null}
      {outcome === 'stopped_at_challenge' ? (
        <SelectField id={`challenge-${jobId}`} label="What the site showed" value={challenge} options={CHALLENGE_OPTIONS} disabled={busy} onChange={setChallenge} />
      ) : null}
      {outcome && outcome !== 'stopped_at_challenge' && outcome !== 'filed' ? (
        <ReasonCodeField
          id={`reason-${jobId}`}
          label={needsReason ? 'Reason (required)' : 'Reason (optional)'}
          value={reasonCode}
          suggestions={REASON_SUGGESTIONS[outcome] ?? []}
          disabled={busy}
          onChange={setReasonCode}
        />
      ) : null}
      {outcome === 'needs_member' ? (
        <Notice tone="info">The member sees that something needs fixing. Keep the reason code plain; put details in the notes.</Notice>
      ) : null}
      {outcome ? (
        <AreaField id={`notes-${jobId}`} label="Notes for staff (never shown to the member)" value={notes} rows={2} disabled={busy} onChange={setNotes} />
      ) : null}
      <FieldIssues issues={issues} />
      <ErrorNote error={error} />
      <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={!outcome || busy} onClick={() => void submit()}>
        {busy ? 'Saving…' : 'Save the result'}
      </button>
    </div>
  );
}

/** A needs_attention job, after a person checked with the administrator or the official site. */
export function ResolveJobForm({ jobId, onDone }: { jobId: string; onDone: (message: string) => void }) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!resolution) return;
    setIssues([]);
    setError(null);
    const parsed = ResolveJobRequestSchema.safeParse({
      resolution,
      confirmation_number: resolution === 'filed' && confirmationNumber.trim() ? confirmationNumber.trim() : null,
      reason_code: reasonCode,
      notes: notes.trim() ? notes.trim() : null,
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.jobResolve(jobId), AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone('Job resolved.');
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gold-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Resolve this job</h3>
      <Notice tone="warn">
        It may already have reached the administrator. Check with them or on the official site before you choose,
        so the claim is never sent twice.
      </Notice>
      <fieldset className="space-y-2">
        <legend className="sr-only">What you found</legend>
        {RESOLUTIONS.map((r) => (
          <label key={r.value} className={`flex gap-3 rounded-lg border p-3 text-sm ${resolution === r.value ? 'border-brand-300 bg-brand-50' : 'border-gray-100'}`}>
            <input type="radio" name={`resolution-${jobId}`} value={r.value} checked={resolution === r.value} disabled={busy} onChange={() => setResolution(r.value)} className="mt-0.5" />
            <span className="font-semibold text-ink">{r.label}</span>
          </label>
        ))}
      </fieldset>
      {resolution === 'filed' ? (
        <TextField id={`resolve-confirmation-${jobId}`} label="Confirmation number (if known)" mono value={confirmationNumber} maxLength={100} disabled={busy} onChange={setConfirmationNumber} />
      ) : null}
      {resolution ? (
        <>
          <ReasonCodeField id={`resolve-reason-${jobId}`} label="Reason (required)" value={reasonCode} suggestions={REASON_SUGGESTIONS.resolve} disabled={busy} onChange={setReasonCode} />
          <AreaField id={`resolve-notes-${jobId}`} label="What you checked (staff only)" value={notes} rows={2} disabled={busy} onChange={setNotes} />
        </>
      ) : null}
      <FieldIssues issues={issues} />
      <ErrorNote error={error} />
      <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={!resolution || busy} onClick={() => void submit()}>
        {busy ? 'Saving…' : 'Resolve'}
      </button>
    </div>
  );
}
