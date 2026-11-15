'use client';

import { useMemo, useState } from 'react';
import { FilePlus2, Save, Undo2 } from 'lucide-react';
import type { ChannelConfig, FilingPolicyContent } from '@/lib/filing/v2/contract';
import { UpdatePolicyDraftRequestSchema, UpsertPolicyDraftRequestSchema, type FilingTarget } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, staffJson, staffPaths, type ApiError, type FieldIssue } from './api';
import { ApprovalForm, RejectPolicyForm } from './ApprovalForms';
import { checkPolicyContent, defaultPolicyContent, zodIssues } from './forms';
import { AGENT_FILING_LABEL, CHANNEL_LABEL } from './labels';
import { PolicyEditor } from './PolicyEditor';
import type { FilingPermissions, PolicyRecord, ReviewerNames } from './types';
import { Badge, ErrorNote, FieldIssues, Notice, Panel } from './ui';
import { ApprovalRecord, VersionHistory } from './VersionHistory';

function channelSummary(c: ChannelConfig): string {
  switch (c.type) {
    case 'filing_desk':
      return `${c.daily_capacity} a day, SLA ${c.sla_business_days} business days, cutoff ${c.min_days_before_deadline} days before the deadline`;
    case 'administrator_email':
      return `to ${c.to}, cutoff ${c.min_days_before_deadline} days`;
    case 'administrator_bulk':
      return `${c.columns.length} columns, up to ${c.max_rows} rows, cutoff ${c.min_days_before_deadline} days`;
    case 'administrator_api':
      return `adapter ${c.adapter} (none exists yet)`;
  }
}

/** The approved version in force, in plain terms. */
export function PolicyInForce({ record, names }: { record: PolicyRecord | null; names: ReviewerNames }) {
  if (!record) {
    return (
      <Notice tone="info">
        No approved version. Members on this settlement finish on the official site (self-file).
      </Notice>
    );
  }
  const c: FilingPolicyContent = record.content;
  const enabled = c.channels.filter((ch) => ch.enabled);
  return (
    <div className="space-y-2 rounded-xl border border-gray-100 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink">In force: version {record.version}</span>
        <Badge tone={c.agent_filing === 'allowed' ? 'green' : 'gray'}>Agent filing: {AGENT_FILING_LABEL[c.agent_filing]}</Badge>
        {c.identity_check_required ? <Badge tone="gold">Identity check required</Badge> : null}
        {c.health_sensitive ? <Badge tone="gold">Health-sensitive</Badge> : null}
        {c.agent_certification_allowed ? <Badge tone="brand">Agent certification allowed</Badge> : null}
      </div>
      <p className="text-ink-muted">States covered: {c.allowed_states ? c.allowed_states.join(', ') : 'no restriction at this level'}</p>
      {enabled.length > 0 ? (
        <ol className="list-decimal space-y-0.5 pl-5 text-ink">
          {enabled.map((ch) => (
            <li key={ch.type}>
              <span className="font-semibold">{CHANNEL_LABEL[ch.type]}</span>: {channelSummary(ch)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-ink-muted">No channel enabled.</p>
      )}
      <ApprovalRecord record={record} names={names} />
    </div>
  );
}

function PolicyDraft({
  permissions,
  draft,
  approvedVersion,
  administratorLevel,
  onChanged,
}: {
  permissions: FilingPermissions;
  draft: PolicyRecord;
  approvedVersion: number | null;
  administratorLevel: boolean;
  onChanged: () => void;
}) {
  const [content, setContent] = useState<FilingPolicyContent>(draft.content);
  const [editorKey, setEditorKey] = useState(0);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(draft.content), [content, draft.content]);
  const canEdit = permissions.canDraft;

  async function save() {
    setError(null);
    const checked = checkPolicyContent(content);
    if (!checked.ok) {
      setIssues(checked.issues);
      return;
    }
    const body = UpdatePolicyDraftRequestSchema.safeParse({ content: checked.value, updated_at: draft.updated_at });
    if (!body.success) {
      setIssues(zodIssues(body.error));
      return;
    }
    setIssues([]);
    setBusy(true);
    const res = await staffJson(staffPaths.policy(draft.id), AnySuccessSchema, { method: 'PATCH', body: body.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  function discard() {
    setContent(draft.content);
    setIssues([]);
    setError(null);
    setEditorKey((k) => k + 1);
  }

  return (
    <div className="space-y-4 rounded-xl border border-gold-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">Draft: version {draft.version}</span>
          <Badge tone="gold">Not in force</Badge>
          {dirty ? <Badge tone="brand">Unsaved changes</Badge> : null}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={busy || !dirty} onClick={discard}>
              <Undo2 className="h-4 w-4" aria-hidden /> Discard changes
            </button>
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy || !dirty} onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden /> {busy ? 'Saving…' : 'Save draft'}
            </button>
          </div>
        ) : null}
      </div>
      <PolicyEditor
        key={editorKey}
        idPrefix={`policy-${draft.id}`}
        value={content}
        onChange={setContent}
        disabled={!canEdit || busy}
        administratorLevel={administratorLevel}
        issues={issues}
      />
      {issues.length > 0 ? (
        <Notice tone="danger">
          <p>Fix these before saving:</p>
          <FieldIssues issues={issues} />
        </Notice>
      ) : null}
      <ErrorNote error={error} />
      {permissions.canApprove ? (
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <ApprovalForm
            kind="policy"
            recordId={draft.id}
            version={draft.version}
            expectedUpdatedAt={draft.updated_at}
            blockedReason={dirty ? 'Save or discard your changes first: approval covers the saved version only.' : null}
            suggestedDocuments={draft.content.sources_reviewed}
            onDone={onChanged}
          />
          <RejectPolicyForm recordId={draft.id} version={draft.version} onDone={onChanged} />
        </div>
      ) : (
        <Notice tone="info">
          A legal reviewer approves or rejects this draft.{' '}
          {approvedVersion ? `Until then, version ${approvedVersion} stays in force.` : 'Until then, members self-file.'}
        </Notice>
      )}
    </div>
  );
}

/** One policy target (the settlement, or its administrator): what is in force, the draft, and the history. */
export function PolicySection({
  permissions,
  target,
  title,
  administratorLevel,
  policies,
  names,
  onChanged,
}: {
  permissions: FilingPermissions;
  target: FilingTarget;
  title: string;
  administratorLevel: boolean;
  policies: readonly PolicyRecord[];
  names: ReviewerNames;
  onChanged: () => void;
}) {
  const approved = policies.find((p) => p.status === 'approved') ?? null;
  const draft = policies.find((p) => p.status === 'draft') ?? null;
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function startDraft() {
    setError(null);
    const body = UpsertPolicyDraftRequestSchema.safeParse({
      target,
      content: approved?.content ?? defaultPolicyContent(),
      ...(approved ? { copy_from_policy_id: approved.id } : {}),
    });
    if (!body.success) {
      setError({ status: 0, code: 'invalid_request', message: 'This version cannot be copied.', fields: zodIssues(body.error), retryAfter: null });
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.policies(), AnySuccessSchema, { method: 'POST', body: body.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  return (
    <Panel
      title={title}
      description={
        administratorLevel
          ? 'Applies to every settlement this administrator handles, and can only restrict: prohibited here means prohibited everywhere.'
          : 'Whether, and through which channels, Lawsuit AI may take a claim on as the member’s agent. Staff draft; only a legal reviewer approves.'
      }
    >
      <div className="space-y-4">
        <PolicyInForce record={approved} names={names} />
        {draft ? (
          <PolicyDraft
            key={`${draft.id}:${draft.updated_at}`}
            permissions={permissions}
            draft={draft}
            approvedVersion={approved?.version ?? null}
            administratorLevel={administratorLevel}
            onChanged={onChanged}
          />
        ) : permissions.canDraft ? (
          <div className="space-y-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy} onClick={() => void startDraft()}>
              <FilePlus2 className="h-4 w-4" aria-hidden />
              {approved ? `Start a draft from version ${approved.version}` : 'Start a draft'}
            </button>
            <ErrorNote error={error} />
          </div>
        ) : null}
        <VersionHistory records={policies} names={names} />
      </div>
    </Panel>
  );
}
