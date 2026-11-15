'use client';

import { useState } from 'react';
import { BadgeCheck, Ban, Gavel } from 'lucide-react';
import type { SourceReviewed } from '@/lib/filing/v2/contract';
import { ApproveRequestSchema, RejectRequestSchema, RetireSpecRequestSchema } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, staffJson, staffPaths, type ApiError, type FieldIssue } from './api';
import { issuesAt, zodIssues } from './forms';
import { SourcesEditor } from './SourcesEditor';
import { AreaField, CheckField, ErrorNote, FieldIssues, Notice } from './ui';

type VersionKind = 'policy' | 'spec';

const CONFIRM_TEXT: Readonly<Record<VersionKind, string>> = {
  policy:
    'I reviewed this policy version and the documents listed, and I approve it. It takes effect as soon as I approve it.',
  spec:
    'I checked this spec version against the official form, word for word, with the documents listed, and I approve it.',
};

/**
 * The law firm's approval of one draft version (legal_reviewer only: callers
 * render it only for them, and the API and database check again). Records
 * notes and the documents reviewed; the confirmation box starts unticked.
 */
export function ApprovalForm({
  kind,
  recordId,
  version,
  expectedUpdatedAt,
  blockedReason,
  suggestedDocuments,
  onDone,
}: {
  kind: VersionKind;
  recordId: string;
  version: number;
  /** The draft's updated_at as shown: the API refuses the approval if the draft changed since. */
  expectedUpdatedAt: string;
  /** Why approving is not possible right now (for example unsaved edits), or null. */
  blockedReason: string | null;
  /** Documents the draft itself lists; the reviewer adds them with one click, never by default. */
  suggestedDocuments: readonly SourceReviewed[];
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [documents, setDocuments] = useState<SourceReviewed[]>([]);
  const missingSuggestions = suggestedDocuments.filter(
    (s) => !documents.some((d) => d.title === s.title && d.url === s.url && d.kind === s.kind),
  );
  const [confirm, setConfirm] = useState(false);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const idPrefix = `approve-${kind}-${recordId}`;

  async function approve() {
    setIssues([]);
    setError(null);
    const parsed = ApproveRequestSchema.safeParse({
      notes,
      documents_reviewed: documents,
      confirm,
      expected_updated_at: expectedUpdatedAt,
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setBusy(true);
    const path = kind === 'policy' ? staffPaths.approvePolicy(recordId) : staffPaths.approveSpec(recordId);
    const res = await staffJson(path, AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirm(false);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-success-100 bg-success-50/40 p-4">
      <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Gavel className="h-4 w-4" aria-hidden /> Approve version {version}
      </h4>
      {blockedReason ? <Notice tone="warn">{blockedReason}</Notice> : null}
      <AreaField id={`${idPrefix}-notes`} label="Approval notes (required)" value={notes} onChange={setNotes} rows={3} />
      <FieldIssues issues={issuesAt(issues, 'notes')} />
      <div>
        <p className="field-label text-xs">Documents reviewed (at least one)</p>
        {missingSuggestions.length > 0 ? (
          <button
            type="button"
            className="btn-ghost mb-2 px-3 py-1.5 text-sm"
            onClick={() => setDocuments((current) => [...current, ...missingSuggestions])}
          >
            Add the {missingSuggestions.length === 1 ? 'document' : `${missingSuggestions.length} documents`} this draft lists
          </button>
        ) : null}
        <SourcesEditor
          idPrefix={`${idPrefix}-docs`}
          value={documents}
          onChange={setDocuments}
          issues={issues}
          pathPrefix="documents_reviewed"
        />
        <FieldIssues issues={issues.filter((i) => i.path === 'documents_reviewed')} />
      </div>
      <CheckField id={`${idPrefix}-confirm`} label={CONFIRM_TEXT[kind]} checked={confirm} onChange={setConfirm} />
      <FieldIssues issues={issuesAt(issues, 'confirm')} />
      <ErrorNote error={error} />
      <button
        type="button"
        className="btn-success px-4 py-2 text-sm"
        disabled={busy || Boolean(blockedReason) || !confirm}
        onClick={() => void approve()}
      >
        <BadgeCheck className="h-4 w-4" aria-hidden /> {busy ? 'Approving…' : `Approve version ${version}`}
      </button>
    </div>
  );
}

/** A legal_reviewer turns a policy draft down, with notes. */
export function RejectPolicyForm({ recordId, version, onDone }: { recordId: string; version: number; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function reject() {
    setIssues([]);
    setError(null);
    const parsed = RejectRequestSchema.safeParse({ notes });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.rejectPolicy(recordId), AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h4 className="text-sm font-bold text-ink">Reject version {version}</h4>
      <AreaField id={`reject-policy-${recordId}`} label="Why (required)" value={notes} onChange={setNotes} rows={2} />
      <FieldIssues issues={issues} />
      <ErrorNote error={error} />
      <button type="button" className="btn-secondary px-4 py-2 text-sm" disabled={busy || notes.trim() === ''} onClick={() => void reject()}>
        <Ban className="h-4 w-4" aria-hidden /> {busy ? 'Rejecting…' : `Reject version ${version}`}
      </button>
    </div>
  );
}

/** A legal_reviewer retires an approved spec version; signed or queued claims on it go back to their members. */
export function RetireSpecForm({ recordId, version, onDone }: { recordId: string; version: number; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function retire() {
    setIssues([]);
    setError(null);
    const parsed = RetireSpecRequestSchema.safeParse({ reason });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.retireSpec(recordId), AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-danger-50 bg-white p-4">
      <h4 className="text-sm font-bold text-ink">Retire version {version}</h4>
      <Notice tone="warn">
        Retiring stops agent filing on this version at once. Signed or queued claims on it go back to their members,
        who review and sign again.
      </Notice>
      <AreaField id={`retire-spec-${recordId}`} label="Why (required)" value={reason} onChange={setReason} rows={2} />
      <FieldIssues issues={issues} />
      <ErrorNote error={error} />
      <button type="button" className="btn-secondary px-4 py-2 text-sm" disabled={busy || reason.trim() === ''} onClick={() => void retire()}>
        <Ban className="h-4 w-4" aria-hidden /> {busy ? 'Retiring…' : `Retire version ${version}`}
      </button>
    </div>
  );
}
