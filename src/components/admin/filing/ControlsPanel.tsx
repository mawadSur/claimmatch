'use client';

import { useState } from 'react';
import { Megaphone, Power, PowerOff } from 'lucide-react';
import { KillSwitchRequestSchema, ObjectionRequestSchema, type FilingTarget } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, staffJson, staffPaths, type ApiError, type FieldIssue } from './api';
import { formatDateTime, localInputToIso } from './format';
import { zodIssues } from './forms';
import type { ControlsView, FilingPermissions, SettlementSummary } from './types';
import { AreaField, Badge, ErrorNote, FieldIssues, Notice, Panel, TextField } from './ui';

export function sameTarget(a: FilingTarget, b: FilingTarget): boolean {
  if ('lawsuit_id' in a && 'lawsuit_id' in b) return a.lawsuit_id === b.lawsuit_id;
  if ('administrator_id' in a && 'administrator_id' in b) return a.administrator_id === b.administrator_id;
  return false;
}

export interface ControlTarget {
  key: string;
  label: string;
  target: FilingTarget;
}

export function controlTargets(summary: SettlementSummary): ControlTarget[] {
  return [
    { key: 'settlement', label: 'This settlement', target: { lawsuit_id: summary.lawsuit_id } },
    ...(summary.administrator
      ? [{ key: 'administrator', label: `Administrator: ${summary.administrator.name}`, target: { administrator_id: summary.administrator.id } }]
      : []),
  ];
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  return { busy, setBusy, error, setError, issues, setIssues };
}

/** Kill switch and objection for one target: both take effect at once, no approval. */
export function ControlsCard({
  permissions,
  control,
  onChanged,
}: {
  permissions: FilingPermissions;
  control: ControlTarget & { view: ControlsView | null };
  onChanged: () => void;
}) {
  const view = control.view;
  const killOn = view?.kill_switch ?? false;
  const objectionAt = view?.objection_received_at ?? null;
  const [killReason, setKillReason] = useState('');
  const [objectionWhen, setObjectionWhen] = useState('');
  const [objectionNotes, setObjectionNotes] = useState('');
  const kill = useAction();
  const objection = useAction();
  const idPrefix = `controls-${control.key}`;

  async function setKill(active: boolean) {
    kill.setError(null);
    kill.setIssues([]);
    const parsed = KillSwitchRequestSchema.safeParse({ target: control.target, active, reason: killReason });
    if (!parsed.success) {
      kill.setIssues(zodIssues(parsed.error));
      return;
    }
    kill.setBusy(true);
    const res = await staffJson(staffPaths.killSwitch(), AnySuccessSchema, { method: 'POST', body: parsed.data });
    kill.setBusy(false);
    if (!res.ok) kill.setError(res.error);
    else {
      setKillReason('');
      onChanged();
    }
  }

  async function setObjection(clearing: boolean) {
    objection.setError(null);
    objection.setIssues([]);
    const receivedAt = clearing ? null : localInputToIso(objectionWhen);
    if (!clearing && !receivedAt) {
      objection.setIssues([{ path: 'received_at', message: 'Say when the objection arrived' }]);
      return;
    }
    const parsed = ObjectionRequestSchema.safeParse({
      target: control.target,
      received_at: receivedAt,
      notes: objectionNotes.trim() === '' ? null : objectionNotes,
    });
    if (!parsed.success) {
      objection.setIssues(zodIssues(parsed.error));
      return;
    }
    objection.setBusy(true);
    const res = await staffJson(staffPaths.objection(), AnySuccessSchema, { method: 'POST', body: parsed.data });
    objection.setBusy(false);
    if (!res.ok) objection.setError(res.error);
    else {
      setObjectionWhen('');
      setObjectionNotes('');
      onChanged();
    }
  }

  const mayKill = killOn ? permissions.canKillSwitchOff : permissions.canKillSwitchOn;
  const mayObject = objectionAt ? permissions.canClearObjection : permissions.canRecordObjection;

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 p-4">
      <h4 className="text-sm font-bold text-ink">{control.label}</h4>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Kill switch</span>
          {killOn ? <Badge tone="red">On: no agent filing</Badge> : <Badge tone="gray">Off</Badge>}
          {view?.kill_switch_changed_at ? (
            <span className="text-xs text-ink-muted">since {formatDateTime(view.kill_switch_changed_at)}</span>
          ) : null}
        </div>
        {killOn && view?.kill_switch_reason ? <p className="text-xs text-ink-muted">Reason: {view.kill_switch_reason}</p> : null}
        {mayKill ? (
          <div className="space-y-2">
            <TextField
              id={`${idPrefix}-kill-reason`}
              label={killOn ? 'Why it can come off (required)' : 'Why (required)'}
              value={killReason}
              maxLength={1000}
              onChange={setKillReason}
            />
            <FieldIssues issues={kill.issues} />
            <ErrorNote error={kill.error} />
            <button
              type="button"
              className={killOn ? 'btn-secondary px-3 py-1.5 text-sm' : 'btn-primary px-3 py-1.5 text-sm'}
              disabled={kill.busy || killReason.trim() === ''}
              onClick={() => void setKill(!killOn)}
            >
              {killOn ? <Power className="h-4 w-4" aria-hidden /> : <PowerOff className="h-4 w-4" aria-hidden />}
              {killOn ? 'Turn the kill switch off' : 'Turn the kill switch on'}
            </button>
            {!killOn ? (
              <p className="text-xs text-ink-muted">
                Takes effect at once: new claims go to self-file and queued ones are handed back. Only a legal
                reviewer can turn it off again.
              </p>
            ) : null}
          </div>
        ) : killOn ? (
          <p className="text-xs text-ink-muted">Only a legal reviewer can turn the kill switch off.</p>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Objection</span>
          {objectionAt ? <Badge tone="gold">Received {formatDateTime(objectionAt)}</Badge> : <Badge tone="gray">None on record</Badge>}
        </div>
        {objectionAt && view?.objection_notes ? <p className="whitespace-pre-wrap text-xs text-ink-muted">{view.objection_notes}</p> : null}
        {mayObject ? (
          <div className="space-y-2">
            {!objectionAt ? (
              <TextField
                id={`${idPrefix}-objection-at`}
                label="Received at"
                type="datetime-local"
                value={objectionWhen}
                onChange={setObjectionWhen}
              />
            ) : null}
            <AreaField
              id={`${idPrefix}-objection-notes`}
              label={objectionAt ? 'Why it is cleared' : 'From whom, and what it says'}
              value={objectionNotes}
              rows={2}
              onChange={setObjectionNotes}
            />
            <FieldIssues issues={objection.issues} />
            <ErrorNote error={objection.error} />
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-sm"
              disabled={objection.busy}
              onClick={() => void setObjection(Boolean(objectionAt))}
            >
              <Megaphone className="h-4 w-4" aria-hidden />
              {objectionAt ? 'Clear the objection' : 'Record an objection'}
            </button>
          </div>
        ) : objectionAt ? (
          <p className="text-xs text-ink-muted">Only a legal reviewer can clear an objection.</p>
        ) : null}
      </div>
    </div>
  );
}

export function ControlsPanel({
  permissions,
  summary,
  controls,
  onChanged,
}: {
  permissions: FilingPermissions;
  summary: SettlementSummary;
  controls: readonly ControlsView[];
  onChanged: () => void;
}) {
  const targets = controlTargets(summary).map((t) => ({ ...t, view: controls.find((c) => sameTarget(c.target, t.target)) ?? null }));
  return (
    <Panel
      title="Controls"
      description="These take effect at once, without an approval. An objection or a kill switch at either level stops agent filing for this settlement."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {targets.map((t) => (
          <ControlsCard key={t.key} permissions={permissions} control={t} onChanged={onChanged} />
        ))}
      </div>
      {targets.some((t) => t.view?.objection_received_at) ? (
        <Notice tone="warn" className="mt-4">
          An objection is on record. Agent filing stays off until a legal reviewer clears it.
        </Notice>
      ) : null}
    </Panel>
  );
}
