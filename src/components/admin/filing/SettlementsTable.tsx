'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { SettlementListResponseSchema } from '@/lib/filing/v2/contract-staff';
import { staffJson, staffPaths, type ApiError } from './api';
import { LaneBadge } from './Badges';
import { formatDay } from './format';
import { AGENT_FILING_LABEL, CHANNEL_LABEL, LANE_REASON_LABEL } from './labels';
import type { SettlementFilter, SettlementSummary } from './types';
import { Badge, ErrorNote, Loading, Panel } from './ui';

const FILTERS: ReadonlyArray<{ value: SettlementFilter; label: string }> = [
  { value: 'all', label: 'All settlements' },
  { value: 'agent_enabled', label: 'Agent channel on' },
  { value: 'needs_review', label: 'Waiting for the law firm' },
  { value: 'kill_switch', label: 'Kill switch on' },
];

const PAGE_SIZE = 25;

export interface SettlementsPage {
  items: SettlementSummary[];
  next_cursor: string | null;
}

function versionText(v: { approved_version: number | null; draft_version: number | null }): string {
  const approved = v.approved_version ? `v${v.approved_version} approved` : 'none approved';
  return v.draft_version ? `${approved}, v${v.draft_version} draft` : approved;
}

export function SettlementRow({ item }: { item: SettlementSummary }) {
  return (
    <tr>
      <td className="px-3 py-2">
        <Link href={`/admin/filing/settlements/${item.lawsuit_id}`} className="font-semibold text-brand-700 hover:underline">
          {item.title}
        </Link>
        <p className="text-xs text-ink-muted">{item.administrator ? item.administrator.name : 'No administrator on record'}</p>
      </td>
      <td className="px-3 py-2 text-ink-muted">{formatDay(item.deadline)}</td>
      <td className="px-3 py-2">{AGENT_FILING_LABEL[item.agent_filing]}</td>
      <td className="px-3 py-2">
        <LaneBadge lane={item.lane_preview} />
        {item.lane_reasons.length > 0 ? (
          <p className="mt-1 text-xs text-ink-muted" title={item.lane_reasons.map((r) => LANE_REASON_LABEL[r]).join('; ')}>
            {LANE_REASON_LABEL[item.lane_reasons[0]]}
            {item.lane_reasons.length > 1 ? ` (+${item.lane_reasons.length - 1})` : ''}
          </p>
        ) : null}
        {item.channels_enabled.length > 0 ? (
          <p className="mt-1 text-xs text-ink-muted">On: {item.channels_enabled.map((c) => CHANNEL_LABEL[c]).join(', ')}</p>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs text-ink-muted">
        <p>Policy: {versionText(item.policy)}</p>
        <p>Spec: {versionText(item.spec)}</p>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {item.kill_switch ? <Badge tone="red">Kill switch</Badge> : null}
          {item.objection ? <Badge tone="gold">Objection</Badge> : null}
          {!item.kill_switch && !item.objection ? <span className="text-xs text-ink-muted">—</span> : null}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{item.open_jobs}</td>
    </tr>
  );
}

export function SettlementsTable({ initial = null }: { initial?: SettlementsPage | null }) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [filter, setFilter] = useState<SettlementFilter>('all');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState<SettlementsPage | null>(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(initial === null);
  /** With server or test data, the first page is already here. */
  const skipFirstLoad = useRef(initial !== null);

  const load = useCallback(async (q: string, f: SettlementFilter, cursor: string | null) => {
    setLoading(true);
    setError(null);
    const res = await staffJson(staffPaths.settlements({ q: q || undefined, filter: f, cursor, limit: PAGE_SIZE }), SettlementListResponseSchema);
    if (res.ok) setPage(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  const cursor = cursors[cursors.length - 1] ?? null;
  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    void load(applied, filter, cursor);
  }, [applied, filter, cursor, load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setCursors([null]);
    setApplied(query.trim());
  }

  return (
    <Panel
      title="Settlements"
      description="Each settlement's lane today for a member with no state issue, its policy and spec versions, controls and open jobs. Open one to edit its policy and spec."
    >
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={onSearch} className="flex min-w-[16rem] flex-1 items-end gap-2">
          <div className="flex-1">
            <label className="field-label text-xs" htmlFor="filing-settlement-search">Search</label>
            <input
              id="filing-settlement-search"
              className="field-input py-2 text-sm"
              value={query}
              maxLength={200}
              placeholder="Settlement name"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary px-3 py-2 text-sm">
            <Search className="h-4 w-4" aria-hidden /> Search
          </button>
        </form>
        <div>
          <label className="field-label text-xs" htmlFor="filing-settlement-filter">Show</label>
          <select
            id="filing-settlement-filter"
            className="field-input py-2 text-sm"
            value={filter}
            onChange={(e) => {
              setCursors([null]);
              setFilter(e.target.value as SettlementFilter);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <ErrorNote error={error} />
        {loading && !page ? <Loading label="Loading settlements…" /> : null}
        {page && page.items.length === 0 ? <p className="text-sm text-ink-muted">No settlements match.</p> : null}
        {page && page.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Settlement</th>
                  <th className="px-3 py-2">Deadline</th>
                  <th className="px-3 py-2">Agent filing</th>
                  <th className="px-3 py-2">Lane today</th>
                  <th className="px-3 py-2">Versions</th>
                  <th className="px-3 py-2">Controls</th>
                  <th className="px-3 py-2 text-right">Open jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {page.items.map((item) => (
                  <SettlementRow key={item.lawsuit_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            disabled={loading || cursors.length <= 1}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            disabled={loading || !page?.next_cursor}
            onClick={() => page?.next_cursor && setCursors((c) => [...c, page.next_cursor])}
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </Panel>
  );
}
