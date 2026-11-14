'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FilePlus2, Save, ShieldCheck, Undo2 } from 'lucide-react';
import type { FilingSpecContent, SourceReviewed } from '@/lib/filing/v2/contract';
import {
  CreateSpecDraftRequestSchema,
  SpecValidationResponseSchema,
  UpdateSpecDraftRequestSchema,
} from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, staffJson, staffPaths, type ApiError, type FieldIssue } from './api';
import { ApprovalForm, RetireSpecForm } from './ApprovalForms';
import { formatDay, httpsUrl } from './format';
import { blankSpecContent, checkSpecContent, todayEastern, zodIssues } from './forms';
import { CHALLENGE_LABEL } from './labels';
import { SpecEditor } from './SpecEditor';
import type { FilingPermissions, ReviewerNames, SpecRecord } from './types';
import { Badge, ErrorNote, FieldIssues, Notice, Panel } from './ui';
import { ApprovalRecord, VersionHistory } from './VersionHistory';

/** The approved spec version members fill in today. */
export function SpecInForce({ record, names }: { record: SpecRecord | null; names: ReviewerNames }) {
  if (!record) {
    return <Notice tone="info">No approved spec. Agent lanes stay off and members finish on the official site.</Notice>;
  }
  const c = record.content;
  const formUrl = httpsUrl(c.official_form.url);
  const proofKinds = new Set(c.benefit_tiers.flatMap((t) => t.proof.map((p) => p.kind)));
  return (
    <div className="space-y-2 rounded-xl border border-gray-100 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink">In use: version {record.version}</span>
        {c.requires_agent_certification ? <Badge tone="gold">Submitter certifies facts</Badge> : null}
        {c.official_form.challenges.map((ch) => (
          <Badge key={ch} tone="red">{CHALLENGE_LABEL[ch]}</Badge>
        ))}
      </div>
      {formUrl ? (
        <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1 text-sm">
          {c.official_form.title ?? 'Official claim form'} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
      <p className="text-ink-muted">
        Deadline: {c.deadline ? `${formatDay(c.deadline.date)} (${c.deadline.time_zone})` : 'none on the form'} ·{' '}
        {c.member_fields.length} member fields · {c.questions.length} questions · {c.benefit_tiers.length} tiers ·{' '}
        {proofKinds.size} proof kinds · {c.payout_options.length} payout options · {c.jev_rules.length} Jev rules
      </p>
      <ApprovalRecord record={record} names={names} />
    </div>
  );
}

/** What a spec approval can cite with one click: the claim form and the class definition's source. */
export function specSuggestedDocuments(content: FilingSpecContent, today: string): SourceReviewed[] {
  const docs: SourceReviewed[] = [];
  if (httpsUrl(content.official_form.url)) {
    docs.push({ kind: 'claim_form', title: content.official_form.title ?? 'Official claim form', url: content.official_form.url, document_ref: null, reviewed_on: today, notes: null });
  }
  if (httpsUrl(content.class_definition.source_url) && content.class_definition.source_url !== content.official_form.url) {
    docs.push({ kind: 'long_form_notice', title: 'Class definition source', url: content.class_definition.source_url, document_ref: null, reviewed_on: today, notes: null });
  }
  return docs;
}

function SpecDraft({
  permissions,
  lawsuitId,
  record,
  initialContent,
  approvedVersion,
  onChanged,
  onCancel,
}: {
  permissions: FilingPermissions;
  lawsuitId: string;
  /** The stored draft; null while creating a new one. */
  record: SpecRecord | null;
  initialContent: FilingSpecContent;
  approvedVersion: number | null;
  onChanged: () => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState<FilingSpecContent>(initialContent);
  const [editorKey, setEditorKey] = useState(0);
  const [rulesValid, setRulesValid] = useState(true);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [ruleIssues, setRuleIssues] = useState<FieldIssue[]>([]);
  const [checked, setChecked] = useState<'ok' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(initialContent), [content, initialContent]);
  const canEdit = permissions.canDraft;
  const creating = record === null;

  function change(next: FilingSpecContent) {
    setContent(next);
    setChecked(null);
  }

  function localCheck(): FilingSpecContent | null {
    if (!rulesValid) {
      setIssues([{ path: 'jev_rules', message: 'Fix the Jev rules JSON first' }]);
      return null;
    }
    const result = checkSpecContent(content);
    if (!result.ok) {
      setIssues(result.issues);
      return null;
    }
    setIssues([]);
    return result.value;
  }

  async function save() {
    setError(null);
    const value = localCheck();
    if (!value) return;
    const body = creating
      ? CreateSpecDraftRequestSchema.safeParse({ lawsuit_id: lawsuitId, content: value })
      : UpdateSpecDraftRequestSchema.safeParse({ content: value, updated_at: record.updated_at });
    if (!body.success) {
      setIssues(zodIssues(body.error));
      return;
    }
    setBusy(true);
    const res = creating
      ? await staffJson(staffPaths.specs(), AnySuccessSchema, { method: 'POST', body: body.data })
      : await staffJson(staffPaths.spec(record.id), AnySuccessSchema, { method: 'PATCH', body: body.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  async function serverCheck() {
    if (!record) return;
    setError(null);
    setRuleIssues([]);
    const value = localCheck();
    if (!value) return;
    setBusy(true);
    const res = await staffJson(staffPaths.validateSpec(record.id), SpecValidationResponseSchema, { method: 'POST', body: { content: value } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const all = res.data.errors;
    setRuleIssues(all.filter((e) => e.path === 'jev_rules' || e.path.startsWith('jev_rules.')));
    setIssues(all.filter((e) => !(e.path === 'jev_rules' || e.path.startsWith('jev_rules.'))));
    setChecked(res.data.ok && all.length === 0 ? 'ok' : null);
  }

  function discard() {
    setContent(initialContent);
    setIssues([]);
    setRuleIssues([]);
    setChecked(null);
    setError(null);
    setRulesValid(true);
    setEditorKey((k) => k + 1);
  }

  return (
    <div className="space-y-4 rounded-xl border border-gold-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{creating ? 'New spec (not saved yet)' : `Draft: version ${record.version}`}</span>
          <Badge tone="gold">Not in use</Badge>
          {dirty && !creating ? <Badge tone="brand">Unsaved changes</Badge> : null}
          {checked === 'ok' ? <Badge tone="green">Check passed</Badge> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {creating && onCancel ? (
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={onCancel}>Cancel</button>
            ) : (
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={busy || !dirty} onClick={discard}>
                <Undo2 className="h-4 w-4" aria-hidden /> Discard changes
              </button>
            )}
            {!creating ? (
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy} onClick={() => void serverCheck()}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Check the spec
              </button>
            ) : null}
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy || (!dirty && !creating)} onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden /> {busy ? 'Working…' : creating ? 'Create the draft' : 'Save draft'}
            </button>
          </div>
        ) : null}
      </div>
      <SpecEditor
        key={editorKey}
        idPrefix={`spec-${record?.id ?? 'new'}`}
        value={content}
        onChange={change}
        onRulesValidity={setRulesValid}
        disabled={!canEdit || busy}
        issues={issues}
        ruleIssues={ruleIssues}
      />
      {issues.length > 0 ? (
        <Notice tone="danger">
          <p>Fix these first:</p>
          <FieldIssues issues={issues} />
        </Notice>
      ) : null}
      <ErrorNote error={error} />
      {record && permissions.canApprove ? (
        <ApprovalForm
          kind="spec"
          recordId={record.id}
          version={record.version}
          expectedUpdatedAt={record.updated_at}
          blockedReason={dirty ? 'Save or discard your changes first: approval covers the saved version only.' : null}
          suggestedDocuments={specSuggestedDocuments(record.content, todayEastern())}
          onDone={onChanged}
        />
      ) : record ? (
        <Notice tone="info">
          A legal reviewer approves this draft.{' '}
          {approvedVersion ? `Until then, version ${approvedVersion} stays in use.` : 'Until then, agent lanes stay off.'}
        </Notice>
      ) : null}
    </div>
  );
}

/** The settlement's filing spec: the version in use, the draft, and the history. */
export function SpecSection({
  permissions,
  lawsuitId,
  deadline,
  specs,
  names,
  onChanged,
}: {
  permissions: FilingPermissions;
  lawsuitId: string;
  deadline: string | null;
  specs: readonly SpecRecord[];
  names: ReviewerNames;
  onChanged: () => void;
}) {
  const approved = specs.find((s) => s.status === 'approved') ?? null;
  const draft = specs.find((s) => s.status === 'draft') ?? null;
  const [creating, setCreating] = useState<FilingSpecContent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function copyApproved() {
    if (!approved) return;
    setError(null);
    const body = CreateSpecDraftRequestSchema.safeParse({ lawsuit_id: lawsuitId, copy_from_spec_id: approved.id });
    if (!body.success) return;
    setBusy(true);
    const res = await staffJson(staffPaths.specs(), AnySuccessSchema, { method: 'POST', body: body.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  return (
    <Panel
      title="Filing spec"
      description="The official form, word for word: questions, proof for each benefit tier, the sworn statement, the class definition, payout options, field order and this settlement’s Jev rules. Staff draft; only a legal reviewer approves."
    >
      <div className="space-y-4">
        <SpecInForce record={approved} names={names} />
        {approved && permissions.canApprove ? (
          <RetireSpecForm recordId={approved.id} version={approved.version} onDone={onChanged} />
        ) : null}
        {draft ? (
          <SpecDraft
            key={`${draft.id}:${draft.updated_at}`}
            permissions={permissions}
            lawsuitId={lawsuitId}
            record={draft}
            initialContent={draft.content}
            approvedVersion={approved?.version ?? null}
            onChanged={onChanged}
          />
        ) : creating ? (
          <SpecDraft
            permissions={permissions}
            lawsuitId={lawsuitId}
            record={null}
            initialContent={creating}
            approvedVersion={approved?.version ?? null}
            onChanged={() => {
              setCreating(null);
              onChanged();
            }}
            onCancel={() => setCreating(null)}
          />
        ) : permissions.canDraft ? (
          <div className="flex flex-wrap gap-2">
            {approved ? (
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy} onClick={() => void copyApproved()}>
                <FilePlus2 className="h-4 w-4" aria-hidden /> Start a draft from version {approved.version}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => setCreating(blankSpecContent({ deadline }))}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden /> Start a blank spec
            </button>
          </div>
        ) : null}
        <ErrorNote error={error} />
        <VersionHistory records={specs} names={names} />
      </div>
    </Panel>
  );
}
