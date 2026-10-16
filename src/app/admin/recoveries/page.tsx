import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  Wallet,
  CircleDollarSign,
  ShieldAlert,
  Clock,
  BadgeCheck,
  Ban,
} from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { formatUSD } from '@/lib/recovery';
import type { RecoveryStatus } from '@/lib/types';
import { StatCard } from '@/components/admin/StatCard';
import {
  RecoveryAdminTable,
  type RecoveryRow,
} from '@/components/admin/RecoveryAdminTable';

export const metadata: Metadata = { title: 'Legacy recoveries' };

export const dynamic = 'force-dynamic';

/**
 * The legacy recoveries ledger. The retired e-sign flow opened a fee row for
 * every "filed" claim although nothing was filed. ClaimMatch never handles
 * settlement money, so this page (and its money actions) is off unless
 * ADMIN_RECOVERIES_ENABLED=1 is set on the server, for the release-letter work.
 */
export default async function AdminRecoveriesPage() {
  if (!flags.adminRecoveries()) notFound();
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

  // Proof for the D38 dry run: rows where any money was ever recorded.
  const withMoney = rows.filter(
    (r) => Number(r.gross_amount ?? 0) > 0 || r.received_at || r.paid_out_at,
  ).length;
  const grossSum = rows.reduce((s, r) => s + Number(r.gross_amount ?? 0), 0);

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
          <Wallet className="h-3.5 w-3.5" /> Legacy ledger
        </span>
        <h2 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">
          Legacy recoveries
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          The retired e-sign flow opened one of these rows for every claim it
          called filed, although nothing was filed. ClaimMatch never handles
          settlement money and collects no fee. Keep this ledger for the release
          letters; record money here only if a person truly reports it.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Legacy rows"
          value={<span className="tabular-nums">{rows.length.toLocaleString()}</span>}
          sub="shown up to 100, newest first"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Rows with money recorded"
          value={<span className="tabular-nums">{withMoney.toLocaleString()}</span>}
          sub={withMoney === 0 ? 'none: no money was recorded' : 'check each one'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Gross recorded"
          value={<span className="tabular-nums">{formatUSD(grossSum)}</span>}
          sub="sum of the rows above"
          icon={<CircleDollarSign className="h-4 w-4" />}
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
