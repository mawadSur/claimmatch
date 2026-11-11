import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BadgeCheck, ClipboardList, HandCoins, Landmark } from 'lucide-react';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { Disclaimer } from '@/components/Disclaimer';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { flags } from '@/lib/flags';
import { SCORECARD_EMPTY_COPY, type ScorecardStat } from '@/lib/scorecard';
import { loadScorecardStats } from '@/lib/scorecard-server';
import { publicPageMetadata } from '@/lib/site-metadata';

export const revalidate = 3600;

const TITLE = 'Public scorecard';
const DESCRIPTION =
  'Measured counts from ClaimMatch: open settlements, claims people told us they filed, and payouts they reported. No estimates.';

export const metadata: Metadata = {
  ...publicPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: '/scorecard',
  }),
  robots: { index: true, follow: true },
};

export default async function ScorecardPage() {
  if (!flags.trustScorecard()) notFound();

  const stats = await loadScorecardStats();

  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <CaptureOnce event={ANALYTICS_EVENTS.scorecard_viewed} />
      <div className="container-narrow py-16 sm:py-20">
        <PageBreadcrumbs
          items={[
            { name: 'Home', href: '/' },
            { name: 'Is this legit?', href: '/trust' },
            { name: TITLE, href: '/scorecard' },
          ]}
        />
        <span className="badge-brand mt-6 gap-1.5">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Measured counts
        </span>
        <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">What we can count so far</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          These numbers come from our database. We hide a stat until at least five records
          from people who are not testers are on file. We never pad or guess.
        </p>

        <dl className="mt-10 grid gap-4 sm:grid-cols-2">
          <StatCard
            icon={Landmark}
            label="Open settlements tracked"
            stat={stats.openSettlements}
          />
          <StatCard
            icon={ClipboardList}
            label="Claims people told us they filed"
            stat={stats.claimsFiled}
          />
          <StatCard
            icon={HandCoins}
            label="Payouts people reported"
            stat={stats.payoutsReported}
          />
          <StatCard
            icon={HandCoins}
            label="Total reported payout amount"
            stat={stats.payoutTotal}
          />
        </dl>

        <p className="mt-6 text-sm leading-relaxed text-ink-muted">
          Filing is something you do on the official settlement site. ClaimMatch never files
          for you and never handles settlement payments.
        </p>

        <Link href="/trust" className="btn-secondary mt-8">
          How we work <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>

        <div className="mt-12">
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  stat,
}: {
  icon: typeof Landmark;
  label: string;
  stat: ScorecardStat;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-brand-600" aria-hidden />
        {label}
      </dt>
      <dd className="mt-3">
        {stat.ready ? (
          <p className="text-3xl font-extrabold text-ink">{stat.display}</p>
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">{SCORECARD_EMPTY_COPY}</p>
        )}
      </dd>
    </div>
  );
}
