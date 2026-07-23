'use client';

import { useState } from 'react';
import {
  Loader2,
  CircleDollarSign,
  BadgeCheck,
  Ban,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import type { Claim, Recovery, RecoveryStatus } from '@/lib/types';
import { formatUSD, round2 } from '@/lib/recovery';

/** A recovery joined with its claim + the claim's lawsuit (title/slug only). */
export type RecoveryRow = Recovery & {
  claim:
    | (Pick<Claim, 'id' | 'lawsuit_title'> & {
        lawsuit: { title: string; slug: string } | null;
      })
    | null;
};

type Action = 'record' | 'mark_paid' | 'deny';

interface Row {
  recovery: RecoveryRow;
  gross: string;
  busy: Action | null;
  error: string | null;
}

const STATUS_TONE: Record<RecoveryStatus, string> = {
  pending: 'badge-gray',
  awaiting_payout: 'badge-brand',
  paid: 'badge-green',
  denied: 'badge-red',
};

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  pending: 'Pending',
  awaiting_payout: 'Awaiting payout',
  paid: 'Paid',
  denied: 'Denied',
};

function grossInit(r: RecoveryRow): string {
  const g = Number(r.gross_amount ?? 0);
  return g > 0 ? String(g) : '';
}

function lawsuitTitle(r: RecoveryRow): string {
  return r.claim?.lawsuit?.title || r.claim?.lawsuit_title || 'Unknown settlement';
}

/**
 * Admin recovery ledger. Each row records the gross a member recovered, advances
 * the payout, or denies the recovery. ClaimMatch takes no cut, so the member's
 * net always equals the gross. Actions PATCH /api/admin/recoveries and
 * optimistically fold the returned row back in. Money uses tabular-nums so
 * figures never jitter.
 */
export function RecoveryAdminTable({ rows: initial }: { rows: RecoveryRow[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((recovery) => ({
      recovery,
      gross: grossInit(recovery),
      busy: null,
      error: null,
    })),
  );

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.recovery.id === id ? { ...r, ...patch } : r)));
  }

  async function act(row: Row, action: Action) {
    const id = row.recovery.id;

    let gross_amount: number | undefined;
    if (action === 'record') {
      const parsed = Number(row.gross.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        update(id, { error: 'Enter a gross amount greater than $0.' });
        return;
      }
      gross_amount = round2(parsed);
    }

    update(id, { busy: action, error: null });
    try {
      const res = await fetch('/api/admin/recoveries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, gross_amount }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        update(id, { busy: null, error: json?.error || 'Action failed.' });
        return;
      }
      // Merge the fresh recovery (server recomputes net_amount = gross / status /
      // timestamps) while keeping the joined claim we already have.
      const returned = json.recovery as Recovery | undefined;
      const merged: RecoveryRow = returned
        ? { ...row.recovery, ...returned, claim: row.recovery.claim }
        : row.recovery;
      update(id, {
        busy: null,
        error: null,
        recovery: merged,
        gross: grossInit(merged),
      });
    } catch {
      update(id, { busy: null, error: 'Network error.' });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Wallet className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold">No recoveries yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          When a filed claim starts paying out, its recovery lands here to record
          the money in and advance the payout.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-card">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-3 font-semibold">Claimant</th>
            <th className="px-4 py-3 font-semibold">Settlement</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 text-right font-semibold">Gross</th>
            <th className="px-4 py-3 text-right font-semibold">Net to member</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const r = row.recovery;
            const grossNum = Number(row.gross.replace(/[^0-9.]/g, '')) || 0;
            // No fee — the member keeps the full gross. Live preview from the
            // input, falling back to the persisted value.
            const netNum =
              grossNum > 0
                ? round2(grossNum)
                : Number(r.net_amount ?? r.gross_amount ?? 0);
            const paid = r.status === 'paid';
            const denied = r.status === 'denied';
            const busy = row.busy !== null;

            return (
              <tr
                key={r.id}
                className="border-b border-gray-50 align-middle last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-xs font-semibold text-ink">
                    {r.user_id.slice(0, 8)}
                  </div>
                  <div className="text-[11px] text-ink-soft">claimant</div>
                  {row.error && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-danger-700">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {row.error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[240px] truncate font-semibold text-ink">
                    {lawsuitTitle(r)}
                  </div>
                  {r.claim?.lawsuit?.slug && (
                    <div className="text-xs text-ink-soft">
                      /{r.claim.lawsuit.slug}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={STATUS_TONE[r.status] ?? 'badge-gray'}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <div className="relative w-32">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Gross amount recovered"
                        placeholder="0.00"
                        disabled={busy || paid}
                        value={row.gross}
                        onChange={(e) =>
                          update(r.id, { gross: e.target.value, error: null })
                        }
                        className="field-input py-2 pl-6 pr-2 text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-success-700">
                  {formatUSD(netNum)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy || paid}
                      onClick={() => act(row, 'record')}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      {row.busy === 'record' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CircleDollarSign className="h-3.5 w-3.5" />
                      )}
                      Record gross
                    </button>
                    <button
                      type="button"
                      disabled={busy || paid || denied || grossNum <= 0}
                      onClick={() => act(row, 'mark_paid')}
                      className="btn-success px-3 py-1.5 text-xs"
                    >
                      {row.busy === 'mark_paid' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BadgeCheck className="h-3.5 w-3.5" />
                      )}
                      Mark paid
                    </button>
                    <button
                      type="button"
                      disabled={busy || denied}
                      onClick={() => act(row, 'deny')}
                      className="btn-ghost px-3 py-1.5 text-xs text-danger-700 hover:bg-danger-50"
                    >
                      {row.busy === 'deny' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )}
                      Deny
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
