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
  ListChecks,
  Loader2,
  Activity,
  ClipboardCheck,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Hash,
  Send,
  HelpCircle,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { StatCard } from '@/components/admin/StatCard';

export const metadata: Metadata = { title: 'Admin' };

// Always compute against live data on each request.
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin');
  const svc = createServiceClient();

  // Exact-count helper (head:true → no rows transferred). Returns null when the
  // query fails (for example a claim state before migration 0006), so a broken
  // count shows "—" instead of a misleading 0.
  async function count(
    table: string,
    modify?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<number | null> {
    try {
      let q = svc.from(table).select('*', { count: 'exact', head: true });
      if (modify) q = modify(q);
      const { count: c, error } = await q;
      if (error) return null;
      return c ?? 0;
    } catch {
      return null;
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
    legacySubmittedNoNumber,
    legacySubmittedAny,
    legacyProcessing,
    legacyOther,
    selfFile,
    reportedFiled,
    submittedWithNumber,
    jobsQueued,
    jobsRunning,
    jobsDone,
    jobsFailed,
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
    count('claims', (q) => q.eq('status', 'submitted').is('confirmation_number', null)),
    count('claims', (q) => q.eq('status', 'submitted')),
    count('claims', (q) => q.eq('status', 'processing')),
    count('claims', (q) => q.in('status', ['approved', 'rejected', 'paid'])),
    count('claims', (q) => q.eq('status', 'self_file')),
    count('claims', (q) => q.eq('status', 'reported_filed')),
    count('claims', (q) => q.eq('status', 'submitted').not('confirmation_number', 'is', null)),
    count('jobs', (q) => q.eq('status', 'queued')),
    count('jobs', (q) => q.eq('status', 'running')),
    count('jobs', (q) => q.eq('status', 'done')),
    count('jobs', (q) => q.eq('status', 'failed')),
  ]);

  const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString());
  const pctOf = (n: number | null, d: number | null) =>
    n !== null && d ? `${Math.round((n / d) * 100)}% of ${d.toLocaleString()}` : 'No members yet';
  // Before migration 0006 there is no confirmation_number column, so every
  // 'submitted' row is a legacy, never-filed row.
  const legacySubmitted = legacySubmittedNoNumber ?? legacySubmittedAny;
  const notFiledLegacy =
    legacySubmitted === null || legacyProcessing === null ? null : legacySubmitted + legacyProcessing;
  const needsMigration = selfFile === null || legacySubmittedNoNumber === null;

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
          Members, catalog review and claim tracking. ClaimMatch never files
          claims or handles settlement money. Counts refresh on each load.
        </p>
      </header>

      {/* Quick-action cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        <QuickActionCard
          href="/admin/review"
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Review queue"
          description="Check new SettleSignal extractions and publish or reject"
          count={pending ?? 0}
          countLabel="pending"
          urgent={(pending ?? 0) > 0}
        />
        <QuickActionCard
          href="/admin/catalog"
          icon={<Library className="h-5 w-5" />}
          title="Settlement catalog"
          description="Manage all settlements, feature the best ones"
          count={lawsuitsTotal ?? 0}
          countLabel="total"
        />
      </section>

      <Section title="Growth" subtitle="Members and engagement">
        <StatCard
          label="Total members"
          value={fmt(members)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Onboarded"
          value={fmt(onboarded)}
          sub={pctOf(onboarded, members)}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Matches generated"
          value={fmt(matchesTotal)}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Notifications (7d)"
          value={fmt(notifs7d)}
          sub="emails + SMS sent"
          icon={<Bell className="h-4 w-4" />}
        />
      </Section>

      <Section title="Catalog" subtitle="Settlement review pipeline">
        <StatCard
          label="Total settlements"
          value={fmt(lawsuitsTotal)}
          icon={<Library className="h-4 w-4" />}
        />
        <StatCard
          label="Published"
          value={fmt(published)}
          sub="live to the public"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Pending review"
          value={fmt(pending)}
          sub={(pending ?? 0) > 0 ? 'awaiting your call' : 'queue clear'}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Draft"
          value={fmt(draft)}
          icon={<Pencil className="h-4 w-4" />}
        />
        <StatCard
          label="Rejected"
          value={fmt(rejectedLawsuits)}
          icon={<XCircle className="h-4 w-4" />}
        />
      </Section>

      <Section
        title="Claims"
        subtitle={
          needsMigration
            ? 'Members file on official sites and report it here. Some counts need migration 0006.'
            : 'Members file on official sites and report it here. ClaimMatch files nothing.'
        }
      >
        <StatCard
          label="Claims tracked"
          value={fmt(claimsTotal)}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Legacy, not filed"
          value={fmt(notFiledLegacy)}
          sub="old e-sign rows; users see “Not filed”. Target 0 after the data correction"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Legacy, unconfirmed"
          value={fmt(legacyOther)}
          sub="approved, rejected or paid rows to review one by one"
          icon={<HelpCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Not filed yet"
          value={fmt(selfFile)}
          sub="tracking, still to file on the official site"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Reported filed"
          value={fmt(reportedFiled)}
          sub="no confirmation number yet"
          icon={<Send className="h-4 w-4" />}
        />
        <StatCard
          label="Submitted with a number"
          value={fmt(submittedWithNumber)}
          sub="administrator confirmation number on file"
          icon={<Hash className="h-4 w-4" />}
        />
      </Section>

      <Section title="Pipeline health" subtitle="Background job queue">
        <StatCard
          label="Queued"
          value={fmt(jobsQueued)}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Running"
          value={fmt(jobsRunning)}
          icon={<Loader2 className="h-4 w-4" />}
        />
        <StatCard
          label="Done"
          value={fmt(jobsDone)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Failed"
          value={fmt(jobsFailed)}
          sub={(jobsFailed ?? 0) > 0 ? 'needs attention' : 'all clear'}
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
