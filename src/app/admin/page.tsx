import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Sparkles,
  Bell,
  Library,
  CheckCircle2,
  Clock,
  Pencil,
  XCircle,
  FileText,
  Wallet,
  CircleDollarSign,
  Percent,
  ListChecks,
  Loader2,
  Activity,
  ClipboardCheck,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { FEE_PCT, formatUSD } from '@/lib/recovery';
import { StatCard } from '@/components/admin/StatCard';

export const metadata: Metadata = { title: 'Admin' };

// Always compute against live data on each request.
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin');
  const svc = createServiceClient();

  // Resilient exact-count helper (head:true → no rows transferred, just the count).
  // Degrades to 0 if Supabase isn't configured so the page still renders.
  async function count(
    table: string,
    modify?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<number> {
    try {
      let q = svc.from(table).select('*', { count: 'exact', head: true });
      if (modify) q = modify(q);
      const { count: c } = await q;
      return c ?? 0;
    } catch {
      return 0;
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Sums can't use head:true — pull just the money columns and reduce in JS.
  const recoveriesPromise = (async () => {
    try {
      const { data } = await svc
        .from('recoveries')
        .select('gross_amount, fee_amount, status');
      return (data ?? []) as {
        gross_amount: number | null;
        fee_amount: number | null;
        status?: string;
      }[];
    } catch {
      return [] as { gross_amount: number | null; fee_amount: number | null; status?: string }[];
    }
  })();

  const [
    members,
    onboarded,
    matchesTotal,
    notifs7d,
    lawsuitsTotal,
    published,
    pending,
    draft,
    rejectedLawsuits,
    claimsTotal,
    claimsProcessing,
    claimsSubmitted,
    claimsApproved,
    claimsRejected,
    claimsPaid,
    jobsQueued,
    jobsRunning,
    jobsDone,
    jobsFailed,
    recoveries,
  ] = await Promise.all([
    count('profiles'),
    count('profiles', (q) => q.eq('onboarded', true)),
    count('matches'),
    count('notifications', (q) => q.gte('created_at', sevenDaysAgo)),
    count('lawsuits'),
    count('lawsuits', (q) => q.eq('review_status', 'published')),
    count('lawsuits', (q) => q.eq('review_status', 'pending_review')),
    count('lawsuits', (q) => q.eq('review_status', 'draft')),
    count('lawsuits', (q) => q.eq('review_status', 'rejected')),
    count('claims'),
    count('claims', (q) => q.eq('status', 'processing')),
    count('claims', (q) => q.eq('status', 'submitted')),
    count('claims', (q) => q.eq('status', 'approved')),
    count('claims', (q) => q.eq('status', 'rejected')),
    count('claims', (q) => q.eq('status', 'paid')),
    count('jobs', (q) => q.eq('status', 'queued')),
    count('jobs', (q) => q.eq('status', 'running')),
    count('jobs', (q) => q.eq('status', 'done')),
    count('jobs', (q) => q.eq('status', 'failed')),
    recoveriesPromise,
  ]);

  const recoveriesCount = recoveries.length;
  const grossSum = recoveries.reduce((s, r) => s + Number(r.gross_amount ?? 0), 0);
  const feeSum = recoveries.reduce((s, r) => s + Number(r.fee_amount ?? 0), 0);

  const pctOf = (n: number, d: number) =>
    d > 0 ? `${Math.round((n / d) * 100)}% of ${d.toLocaleString()}` : 'No members yet';
  const feePctLabel = `${Math.round(FEE_PCT * 100)}% contingency`;

  const awaitingPayoutRecoveries = recoveries.filter(
    (r) => r.status === 'awaiting_payout',
  ).length;

  return (
    <div className="space-y-10">
      <header>
        <span className="badge-brand gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Live metrics
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
          Operations dashboard
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          We complete claim filings for account holders — track progress, review
          new settlements, and manage payouts. All counts refresh on each load.
        </p>
      </header>

      {/* Quick-action cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickActionCard
          href="/admin/review"
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Review queue"
          description="Check new SettleSignal extractions and publish or reject"
          count={pending}
          countLabel="pending"
          urgent={pending > 0}
        />
        <QuickActionCard
          href="/admin/catalog"
          icon={<Library className="h-5 w-5" />}
          title="Settlement catalog"
          description="Manage all settlements, feature the best ones"
          count={lawsuitsTotal}
          countLabel="total"
        />
        <QuickActionCard
          href="/admin/recoveries"
          icon={<Wallet className="h-5 w-5" />}
          title="Recoveries"
          description="Record payouts and advance member funds"
          count={awaitingPayoutRecoveries}
          countLabel="awaiting payout"
          urgent={awaitingPayoutRecoveries > 0}
        />
      </section>

      <Section title="Growth" subtitle="Members and engagement">
        <StatCard
          label="Total members"
          value={members.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Onboarded"
          value={onboarded.toLocaleString()}
          sub={pctOf(onboarded, members)}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Matches generated"
          value={matchesTotal.toLocaleString()}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Notifications (7d)"
          value={notifs7d.toLocaleString()}
          sub="emails + SMS sent"
          icon={<Bell className="h-4 w-4" />}
        />
      </Section>

      <Section title="Catalog" subtitle="Settlement review pipeline">
        <StatCard
          label="Total settlements"
          value={lawsuitsTotal.toLocaleString()}
          icon={<Library className="h-4 w-4" />}
        />
        <StatCard
          label="Published"
          value={published.toLocaleString()}
          sub="live to the public"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Pending review"
          value={pending.toLocaleString()}
          sub={pending > 0 ? 'awaiting your call' : 'queue clear'}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Draft"
          value={draft.toLocaleString()}
          icon={<Pencil className="h-4 w-4" />}
        />
        <StatCard
          label="Rejected"
          value={rejectedLawsuits.toLocaleString()}
          icon={<XCircle className="h-4 w-4" />}
        />
      </Section>

      <Section title="Claims & revenue" subtitle="Filed claims and money recovered">
        <StatCard
          label="Claims filed"
          value={claimsTotal.toLocaleString()}
          sub={`${claimsSubmitted.toLocaleString()} submitted · ${claimsApproved.toLocaleString()} approved`}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Paid claims"
          value={claimsPaid.toLocaleString()}
          sub={`${claimsProcessing.toLocaleString()} processing · ${claimsRejected.toLocaleString()} not eligible`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Recoveries opened"
          value={recoveriesCount.toLocaleString()}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Gross recovered"
          value={formatUSD(grossSum)}
          sub="total settlements paid"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Our fees"
          value={formatUSD(feeSum)}
          sub={feePctLabel}
          icon={<Percent className="h-4 w-4" />}
        />
      </Section>

      <Section title="Pipeline health" subtitle="Background job queue">
        <StatCard
          label="Queued"
          value={jobsQueued.toLocaleString()}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Running"
          value={jobsRunning.toLocaleString()}
          icon={<Loader2 className="h-4 w-4" />}
        />
        <StatCard
          label="Done"
          value={jobsDone.toLocaleString()}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Failed"
          value={jobsFailed.toLocaleString()}
          sub={jobsFailed > 0 ? 'needs attention' : 'all clear'}
          icon={<XCircle className="h-4 w-4" />}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  count,
  countLabel,
  urgent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between">
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            urgent
              ? 'bg-brand-600 text-white'
              : 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100'
          } transition-colors group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0`}
        >
          {icon}
        </span>
        {urgent && count > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
            <AlertCircle className="h-3 w-3" />
            Action needed
          </span>
        )}
      </div>
      <h3 className="mt-4 text-base font-bold text-ink group-hover:text-brand-700">
        {title}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-sm">
          <span className="font-bold tabular-nums text-ink">
            {count.toLocaleString()}
          </span>{' '}
          <span className="text-ink-soft">{countLabel}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-ink-soft transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
      </div>
    </Link>
  );
}
