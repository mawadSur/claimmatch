import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  Wallet,
  CircleDollarSign,
  HandCoins,
  Clock,
  BadgeCheck,
  Ban,
} from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { formatUSD } from '@/lib/recovery';
import type { RecoveryStatus } from '@/lib/types';
import { StatCard } from '@/components/admin/StatCard';
import {
  RecoveryAdminTable,
  type RecoveryRow,
} from '@/components/admin/RecoveryAdminTable';

export const metadata: Metadata = { title: 'Recoveries' };

export const dynamic = 'force-dynamic';

/**
 * Money desk: the ledger of every recovery. Admins record the gross a member
 * recovered, advance the payout, or deny it. ClaimMatch takes no cut, so net
 * always equals gross — these tiles track recovered totals for analytics, not
 * revenue owed to us.
 */
export default async function AdminRecoveriesPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/recoveries');
  const svc = createServiceClient();

  let rows: RecoveryRow[] = [];
  try {
    const { data } = await svc
      .from('recoveries')
      .select('*, claim:claims(*, lawsuit:lawsuits(title,slug))')
      .order('created_at', { ascending: false })
      .limit(100);
    rows = (data ?? []) as RecoveryRow[];
  } catch {
    rows = [];
  }

  // Roll-ups. Gross counts every recovery with money recorded; "paid out" only
  // counts recoveries actually paid to the member (net == gross, no fee).
  const grossSum = rows.reduce((s, r) => s + Number(r.gross_amount ?? 0), 0);
  const netPaidSum = rows.reduce(
    (s, r) => s + (r.status === 'paid' ? Number(r.net_amount ?? 0) : 0),
    0,
  );
  const awaitingSum = rows.reduce(
    (s, r) => s + (r.status === 'awaiting_payout' ? Number(r.gross_amount ?? 0) : 0),
    0,
  );

  const counts: Record<RecoveryStatus, number> = {
    pending: 0,
    awaiting_payout: 0,
    paid: 0,
    denied: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status] += 1;
  }

  return (
    <div className="space-y-8">
      <header>
        <span className="badge-brand gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Money desk
        </span>
        <h2 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">
          Recoveries
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Record the money members recover and advance each payout. ClaimMatch
          takes no cut — the member keeps the full amount, and this ledger tracks
          recovered totals for analytics.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Total recovered"
          value={<span className="tabular-nums">{formatUSD(grossSum)}</span>}
          sub="gross across all members"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Paid out to members"
          value={<span className="tabular-nums">{formatUSD(netPaidSum)}</span>}
          sub={`${counts.paid.toLocaleString()} paid out`}
          icon={<HandCoins className="h-4 w-4" />}
        />
        <StatCard
          label="Awaiting payout"
          value={<span className="tabular-nums">{formatUSD(awaitingSum)}</span>}
          sub={`${counts.awaiting_payout.toLocaleString()} in flight`}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Recoveries"
          value={<span className="tabular-nums">{rows.length.toLocaleString()}</span>}
          sub={`${counts.pending.toLocaleString()} pending`}
          icon={<Wallet className="h-4 w-4" />}
        />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <StatusPill
          tone="badge-gray"
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Pending"
          count={counts.pending}
        />
        <StatusPill
          tone="badge-brand"
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Awaiting payout"
          count={counts.awaiting_payout}
        />
        <StatusPill
          tone="badge-green"
          icon={<BadgeCheck className="h-3.5 w-3.5" />}
          label="Paid"
          count={counts.paid}
        />
        <StatusPill
          tone="badge-red"
          icon={<Ban className="h-3.5 w-3.5" />}
          label="Denied"
          count={counts.denied}
        />
      </section>

      <RecoveryAdminTable rows={rows} />
    </div>
  );
}

function StatusPill({
  tone,
  icon,
  label,
  count,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <span className={`${tone} gap-1.5`}>
      {icon}
      {label}
      <span className="tabular-nums font-bold">{count.toLocaleString()}</span>
    </span>
  );
}
