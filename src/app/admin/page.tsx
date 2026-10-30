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
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import type { HeldClosure, IngestSummary } from '@/lib/scraper/pipeline';
import { ingestProblems, ingestRunNeedsAttention } from '@/app/api/cron/_lib/report';
import { StatCard } from '@/components/admin/StatCard';
import { SoftLaunchCard } from '@/components/admin/SoftLaunchCard';
import { BrokenLinksList } from '@/components/admin/BrokenLinksList';
import { flags } from '@/lib/flags';
import { listBrokenOfficialLinks } from '@/lib/link-check';
import { MissingFeedQueue } from '@/components/admin/MissingFeedQueue';
import { HeldClosuresQueue } from '@/components/admin/HeldClosuresQueue';
import {
  listMissingFeedCloseQueue,
  missingFeedCloseThreshold,
} from '@/lib/missing-feed-queue';
import { listHeldClosureQueue } from '@/lib/held-closures';
import { EMPTY_SOFT_LAUNCH_COUNTS, loadSoftLaunchCounts } from '@/lib/soft-launch';

export const metadata: Metadata = { title: 'Admin' };

// Always compute against live data on each request.
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await requireAdmin('/admin');
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
  const lastIngest = await loadLastIngestRun(svc);
  const lastDigestFailure = await loadLastDigestFailure(svc);
  const softLaunch = await loadSoftLaunchCounts().catch(() => ({ ...EMPTY_SOFT_LAUNCH_COUNTS }));
  const brokenLinks = flags.linkCheck()
    ? await listBrokenOfficialLinks(50).catch(() => [])
    : [];
  const missingFeedQueue = flags.missingCloseQueue()
    ? await listMissingFeedCloseQueue().catch(() => [])
    : [];
  const missingFeedAfter = missingFeedCloseThreshold();
  const heldClosureQueue = flags.adminHeldClosures()
    ? await listHeldClosureQueue().catch(() => [])
    : [];

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

      <CronFailureBanners ingest={lastIngest} digest={lastDigestFailure} />

      <SoftLaunchCard counts={softLaunch} />
      {flags.linkCheck() ? <BrokenLinksList rows={brokenLinks} /> : null}
      {flags.missingCloseQueue() ? (
        <section aria-labelledby="missing-feed-title">
          <div className="mb-4">
            <h3 id="missing-feed-title" className="text-lg font-bold text-ink">
              Missing from feed, propose close
            </h3>
            <p className="text-sm text-ink-soft">
              Open SettleSignal listings absent from {missingFeedAfter} consecutive successful
              feeds. Close or keep — nothing is auto-closed.
            </p>
          </div>
          <MissingFeedQueue items={missingFeedQueue} closeAfter={missingFeedAfter} />
        </section>
      ) : null}
      {flags.adminHeldClosures() ? (
        <section aria-labelledby="held-closures-title">
          <div className="mb-4">
            <h3 id="held-closures-title" className="text-lg font-bold text-ink">
              Held closures, review before closing
            </h3>
            <p className="text-sm text-ink-soft">
              Closures the ingest circuit breaker held. Approve applies only that
              close. Dismiss hides the slug until the planned change differs.{' '}
              <Link href="/admin/held-closures" className="font-semibold text-brand-700 underline">
                Open the full queue
              </Link>
              . Nothing is auto-closed.
            </p>
          </div>
          <HeldClosuresQueue items={heldClosureQueue} />
        </section>
      ) : null}

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

      <LastIngestRun run={lastIngest} />

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

interface IngestRun {
  at: string;
  status: string;
  error: string | null;
  summary: Partial<IngestSummary>;
}

interface DigestFailure {
  at: string;
  error: string;
}

/** Latest failed digest (recordCronFailure), or null. */
async function loadLastDigestFailure(
  svc: ReturnType<typeof createServiceClient>,
): Promise<DigestFailure | null> {
  try {
    const { data, error } = await svc
      .from('jobs')
      .select('created_at, error, payload')
      .eq('type', 'notify')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return null;
    const row = (data as Array<{ created_at: string; error: string | null; payload: unknown }>).find(
      (r) => {
        const payload = r.payload && typeof r.payload === 'object' ? (r.payload as { trigger?: string }) : {};
        return payload.trigger === 'cron/digest';
      },
    );
    if (!row || !row.error) return null;
    return { at: String(row.created_at), error: row.error };
  } catch {
    return null;
  }
}

function CronFailureBanners({
  ingest,
  digest,
}: {
  ingest: IngestRun | null;
  digest: DigestFailure | null;
}) {
  const ingestFailed = ingest && ingest.status === 'failed';
  const ingestReason = ingestFailed ? ingest.error ?? (ingestProblems(ingest.summary).join('; ') || 'unknown error') : null;
  if (!ingestFailed && !digest) return null;
  return (
    <div className="space-y-3">
      {ingestFailed && ingestReason && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
          Last ingest failed: {ingestReason}, {new Date(ingest.at).toUTCString()}
        </p>
      )}
      {digest && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
          Last digest failed: {digest.error}, {new Date(digest.at).toUTCString()}
        </p>
      )}
    </div>
  );
}

/** The latest ingest run record (src/lib/jobs.ts recordIngestRun), or null. */
async function loadLastIngestRun(svc: ReturnType<typeof createServiceClient>): Promise<IngestRun | null> {
  try {
    const { data, error } = await svc
      .from('jobs')
      .select('created_at, status, error, result')
      .eq('type', 'pipeline')
      .in('status', ['done', 'failed', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const result = data.result && typeof data.result === 'object' ? (data.result as Partial<IngestSummary>) : {};
    return {
      at: String(data.created_at),
      status: String(data.status),
      error: typeof data.error === 'string' ? data.error : null,
      summary: result,
    };
  } catch {
    return null;
  }
}

/**
 * The latest catalog ingest: its counts and, in full, every closure the
 * circuit breaker held, so each can be checked on the official site before
 * INGEST_MAX_CLOSE_SHARE is raised for one run.
 */
function LastIngestRun({ run }: { run: IngestRun | null }) {
  const held: HeldClosure[] = Array.isArray(run?.summary.heldClosures) ? run.summary.heldClosures : [];
  const n = (v: number | undefined) => (typeof v === 'number' ? v.toLocaleString() : '—');
  // Held closures or failed writes need a person whatever status the run was
  // stored with; without a stored error, list what the summary shows.
  const attention = run ? ingestRunNeedsAttention(run) : false;
  const problem = run ? run.error ?? (ingestProblems(run.summary).join('; ') || null) : null;
  return (
    <section aria-labelledby="last-ingest-title">
      <div className="mb-4">
        <h3 id="last-ingest-title" className="text-lg font-bold text-ink">
          Last catalog ingest
        </h3>
        <p className="text-sm text-ink-soft">
          {run
            ? `${new Date(run.at).toUTCString()} · ${
                run.status === 'running'
                  ? 'started, still running'
                  : attention
                    ? 'needs attention'
                    : 'no problems'
              }`
            : 'No run recorded yet. The daily cron records each run here.'}
        </p>
      </div>
      {run && (
        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
          {problem && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
              {problem}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {(
              [
                ['Feed records', run.summary.ingested],
                ['New, in review', run.summary.pending_review],
                ['Closed', run.summary.closed],
                ['Closed by deadline', run.summary.closedByDeadline],
                ['Closed by missing feed', run.summary.closedByMissingFeed],
                ['Held closures', run.summary.held],
                ['Reopened', run.summary.reopened],
                ['Deadline changes', run.summary.deadlineChanges],
                ['Flagged for a look', run.summary.flagged],
                ['Failed reads or writes', run.summary.failed],
              ] as [string, number | undefined][]
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-bold tabular-nums text-ink">{n(value)}</dd>
              </div>
            ))}
          </dl>
          {held.length > 0 && (
            <details className="rounded-xl bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {held.length.toLocaleString()} held closures. Check each on the official site before raising
                INGEST_MAX_CLOSE_SHARE.
              </summary>
              <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto text-sm text-ink-muted">
                {held.map((h) => (
                  <li key={`${h.source}:${h.slug}`}>
                    <span className="font-mono text-ink">{h.slug}</span>: {h.changes.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
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
