'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FileDown, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { BulkExportRequestSchema, BulkResultsRequestSchema, SettlementListResponseSchema } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, fetchAllPages, fetchJobs, postBulkExport, saveBlob, staffJson, staffPaths, type ApiError, type BulkExportFile, type FieldIssue } from './api';
import { CopyButton } from './CopyButton';
import { normalizeReasonCode } from './DeskForms';
import { formatDateTime, formatDay, shortId } from './format';
import { zodIssues } from './forms';
import { REASON_SUGGESTIONS } from './labels';
import { sortQueue } from './sla';
import type { FilingPermissions, JobSummary } from './types';
import { CheckField, ErrorNote, FieldIssues, Loading, Notice, NumberField, Panel, TextField } from './ui';

export type BulkOutcome = '' | 'filed' | 'rejected' | 'needs_attention';

export interface BulkRow {
  outcome: BulkOutcome;
  confirmationNumber: string;
  reasonCode: string;
}

/** Only rows with an outcome are sent; the contract schema checks the rest. */
export function buildBulkResults(rows: Readonly<Record<string, BulkRow>>) {
  return {
    results: Object.entries(rows)
      .filter(([, r]) => r.outcome !== '')
      .map(([jobId, r]) => ({
        job_id: jobId,
        outcome: r.outcome as Exclude<BulkOutcome, ''>,
        confirmation_number: r.outcome === 'filed' && r.confirmationNumber.trim() ? r.confirmationNumber.trim() : null,
        reason_code: r.outcome !== 'filed' && r.reasonCode ? r.reasonCode : null,
      })),
  };
}

export interface BulkSettlement {
  id: string;
  title: string;
  deadline: string | null;
  bulkEnabled: boolean;
}

/** Server or test data for the first render. */
export interface BulkInitial {
  settlements: BulkSettlement[];
  queued: JobSummary[];
  exported: JobSummary[];
}

const EMPTY_ROW: BulkRow = { outcome: '', confirmationNumber: '', reasonCode: '' };

/**
 * /admin/filing/bulk: export a settlement's queued administrator_bulk claims
 * as the administrator's CSV layout, upload it to their portal yourself, then
 * record each claim's result here.
 */
export function BulkConsole({
  permissions,
  lawsuitId = null,
  initial = null,
}: {
  permissions: FilingPermissions;
  lawsuitId?: string | null;
  initial?: BulkInitial | null;
}) {
  const [settlements, setSettlements] = useState<BulkSettlement[] | null>(initial?.settlements ?? null);
  const [selected, setSelected] = useState<string>(lawsuitId ?? '');
  const [queued, setQueued] = useState<JobSummary[]>(initial?.queued ?? []);
  const [exported, setExported] = useState<JobSummary[]>(initial ? sortQueue(initial.exported) : []);
  const skipFirstLoad = useRef(initial !== null);
  const [error, setError] = useState<ApiError | null>(null);
  const [exportIssues, setExportIssues] = useState<FieldIssue[]>([]);
  const [maxRows, setMaxRows] = useState<number | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const [file, setFile] = useState<BulkExportFile | null>(null);
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<Record<string, BulkRow>>({});
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettlements = useCallback(async () => {
    const [list, exportedAll] = await Promise.all([
      fetchAllPages((cursor) => staffJson(staffPaths.settlements({ filter: 'agent_enabled', cursor, limit: 100 }), SettlementListResponseSchema), 5),
      fetchJobs({ channel: 'administrator_bulk', status: 'exported' }, 5),
    ]);
    if (!list.ok) return setError(list.error);
    if (!exportedAll.ok) return setError(exportedAll.error);
    const byId = new Map<string, BulkSettlement>();
    for (const s of list.items) {
      if (s.channels_enabled.includes('administrator_bulk')) byId.set(s.lawsuit_id, { id: s.lawsuit_id, title: s.title, deadline: s.deadline, bulkEnabled: true });
    }
    for (const j of exportedAll.items) {
      if (!byId.has(j.lawsuit_id)) byId.set(j.lawsuit_id, { id: j.lawsuit_id, title: j.settlement_title, deadline: j.deadline, bulkEnabled: false });
    }
    setSettlements([...byId.values()].sort((a, b) => a.title.localeCompare(b.title)));
  }, []);

  const loadJobs = useCallback(async (id: string) => {
    if (!UuidSchema.safeParse(id).success) return;
    const [q, e] = await Promise.all([
      fetchJobs({ channel: 'administrator_bulk', status: 'queued', lawsuit_id: id }, 5),
      fetchJobs({ channel: 'administrator_bulk', status: 'exported', lawsuit_id: id }, 50),
    ]);
    if (!q.ok) return setError(q.error);
    if (!e.ok) return setError(e.error);
    setQueued(q.items);
    setExported(sortQueue(e.items));
  }, []);

  useEffect(() => {
    if (!skipFirstLoad.current) void loadSettlements();
  }, [loadSettlements]);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    setRows({});
    setIssues([]);
    if (selected) void loadJobs(selected);
  }, [selected, loadJobs]);

  const current = useMemo(() => settlements?.find((s) => s.id === selected) ?? null, [settlements, selected]);

  async function exportCsv() {
    setError(null);
    setMessage(null);
    setExportIssues([]);
    const body = BulkExportRequestSchema.safeParse({ lawsuit_id: selected, ...(maxRows ? { max_rows: maxRows } : {}), confirm });
    if (!body.success) return setExportIssues(zodIssues(body.error));
    setBusy(true);
    const res = await postBulkExport(body.data);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setFile(res.data);
    setBatchId(res.data.batchId);
    setConfirm(false);
    saveBlob(res.data.blob, res.data.fileName);
    void loadJobs(selected);
  }

  async function saveResults() {
    setError(null);
    setMessage(null);
    setIssues([]);
    if (!UuidSchema.safeParse(batchId).success) return setIssues([{ path: 'batch', message: 'Enter the batch id from the export' }]);
    const local = Object.entries(rows)
      .filter(([, r]) => (r.outcome === 'rejected' || r.outcome === 'needs_attention') && !r.reasonCode)
      .map(([id]) => ({ path: `job ${shortId(id)}`, message: 'Say why' }));
    if (local.length > 0) return setIssues(local);
    const body = BulkResultsRequestSchema.safeParse(buildBulkResults(rows));
    if (!body.success) return setIssues(zodIssues(body.error));
    setBusy(true);
    const res = await staffJson(staffPaths.bulkResults(batchId), AnySuccessSchema, { method: 'POST', body: body.data });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMessage(`Saved ${body.data.results.length} results.`);
    setRows({});
    void loadJobs(selected);
  }

  const setRow = (id: string, patch: Partial<BulkRow>) => setRows((r) => ({ ...r, [id]: { ...(r[id] ?? EMPTY_ROW), ...patch } }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">
          <Link href="/admin/filing" className="font-semibold text-brand-700 underline">Filing console</Link>
          <span aria-hidden> / </span>
          Bulk exports
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="badge-brand gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Administrator bulk file</span>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Bulk exports</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Individually signed, Jev-checked claims in the administrator’s third-party-filer layout. You upload the
              file to the administrator’s portal yourself, then record each claim’s result here.
            </p>
          </div>
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => { void loadSettlements(); if (selected) void loadJobs(selected); }}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </button>
        </div>
      </div>

      <ErrorNote error={error} />
      {message ? <Notice tone="success">{message}</Notice> : null}
      {settlements === null && !error ? <Loading label="Loading settlements…" /> : null}

      {settlements ? (
        <Panel title="Settlement">
          {settlements.length === 0 ? (
            <p className="text-sm text-ink-muted">No settlement has the bulk channel on, and no export is waiting for results.</p>
          ) : (
            <select aria-label="Settlement" className="field-input max-w-xl py-2 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Choose a settlement</option>
              {settlements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({formatDay(s.deadline)}){s.bulkEnabled ? '' : ' (results only)'}
                </option>
              ))}
            </select>
          )}
        </Panel>
      ) : null}

      {current ? (
        <Panel title="Export" description={`${queued.length} queued claims ready for the next file.`}>
          {!permissions.canWorkDesk ? (
            <Notice tone="info">Only filing agents export files and record results.</Notice>
          ) : !current.bulkEnabled ? (
            <Notice tone="info">The bulk channel is off for this settlement. You can still record results for earlier exports below.</Notice>
          ) : (
            <div className="space-y-3">
              <Notice tone="warn">
                The file holds members’ personal data. Upload it only to the administrator’s portal, and delete your copy
                once the results are recorded. Each export is logged.
              </Notice>
              <div className="max-w-xs">
                <NumberField id="bulk-max-rows" label="Most rows (optional)" value={maxRows} min={1} max={5000} onChange={setMaxRows} />
              </div>
              <CheckField id="bulk-confirm" label="I will upload this file to the administrator’s portal myself and record each claim’s result here." checked={confirm} onChange={setConfirm} />
              <FieldIssues issues={exportIssues} />
              <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={busy || !confirm || queued.length === 0} onClick={() => void exportCsv()}>
                <FileDown className="h-4 w-4" aria-hidden /> {busy ? 'Exporting…' : 'Export and download the CSV'}
              </button>
            </div>
          )}
          {file ? (
            <div className="mt-4 space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
              <p>
                Batch <span className="font-mono">{file.batchId}</span> <CopyButton text={file.batchId} label="batch id" />
              </p>
              <p className="text-ink-muted">{file.rows ?? '?'} rows · SHA-256 <span className="break-all font-mono text-xs">{file.sha256 ?? 'not given'}</span></p>
              <button type="button" className="text-link text-xs" onClick={() => saveBlob(file.blob, file.fileName)}>Download it again</button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {current ? (
        <Panel title={`Results (${exported.length} exported)`} description="After the administrator answers, record each claim. Leave a row empty if you do not know yet.">
          {exported.length === 0 ? (
            <p className="text-sm text-ink-muted">No exported claims are waiting for results.</p>
          ) : (
            <div className="space-y-3">
              <div className="max-w-md">
                <TextField id="bulk-batch" label="Batch id (from the export)" mono value={batchId} disabled={!permissions.canWorkDesk} onChange={(v) => setBatchId(v.trim())} />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">Claim</th>
                      <th className="px-3 py-2">Exported</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Confirmation number or reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {exported.map((job) => {
                      const row = rows[job.id] ?? EMPTY_ROW;
                      return (
                        <tr key={job.id} className="align-top">
                          <td className="px-3 py-2 font-mono text-xs">
                            {job.claim_id} <CopyButton text={job.claim_id} label="claim id" />
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{formatDateTime(job.created_at)}</td>
                          <td className="px-3 py-2">
                            <select aria-label={`Result for claim ${shortId(job.claim_id)}`} className="field-input py-1.5 text-sm" value={row.outcome} disabled={!permissions.canWorkDesk} onChange={(e) => setRow(job.id, { outcome: e.target.value as BulkOutcome })}>
                              <option value="">Not known yet</option>
                              <option value="filed">Accepted by the administrator</option>
                              <option value="rejected">Refused by the administrator</option>
                              <option value="needs_attention">Unclear: needs a person</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {row.outcome === 'filed' ? (
                              <input aria-label={`Confirmation number for claim ${shortId(job.claim_id)}`} className="field-input py-1.5 font-mono text-sm" maxLength={100} value={row.confirmationNumber} placeholder="If the administrator gave one" onChange={(e) => setRow(job.id, { confirmationNumber: e.target.value })} />
                            ) : row.outcome ? (
                              <input aria-label={`Reason for claim ${shortId(job.claim_id)}`} list="bulk-reasons" className="field-input py-1.5 font-mono text-sm" value={row.reasonCode} placeholder="reason_code" onChange={(e) => setRow(job.id, { reasonCode: normalizeReasonCode(e.target.value) })} />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="bulk-reasons">
                  {[...REASON_SUGGESTIONS.rejected, ...REASON_SUGGESTIONS.needs_attention].map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <FieldIssues issues={issues} />
              {permissions.canWorkDesk ? (
                <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={busy || Object.values(rows).every((r) => r.outcome === '')} onClick={() => void saveResults()}>
                  {busy ? 'Saving…' : 'Save these results'}
                </button>
              ) : null}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
