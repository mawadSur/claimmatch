import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  Handshake,
  MousePointerClick,
  TrendingUp,
  CircleDollarSign,
  CheckCircle2,
} from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { summarizeLeadEvents, centsToUSD } from '@/lib/partners';
import { SAMPLE_PARTNERS } from '@/lib/sample-partners';
import type { LeadEvent, Partner } from '@/lib/types';
import { StatCard } from '@/components/admin/StatCard';
import {
  PartnerAdminTable,
  type PartnerStats,
} from '@/components/admin/PartnerAdminTable';

export const metadata: Metadata = { title: 'Partners' };

export const dynamic = 'force-dynamic';

/**
 * Partner desk: the referral-revenue catalog. Lists every partner with payout
 * terms and live performance, and lets an admin add partners or toggle them on
 * and off. Falls back to the sample catalog when Supabase isn't configured so
 * the surface is visible in every environment (toggles then no-op with an error).
 */
export default async function AdminPartnersPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/partners');
  const svc = createServiceClient();

  // All partners (incl. inactive) for admin. Configured DB is authoritative;
  // only fall back to samples when the query is unavailable.
  let partners: Partner[] = [];
  let loaded = false;
  try {
    const { data, error } = await svc
      .from('partners')
      .select('*')
      .order('priority', { ascending: false });
    if (!error && data) {
      partners = data as Partner[];
      loaded = true;
    }
  } catch {
    loaded = false;
  }
  if (!loaded) partners = SAMPLE_PARTNERS;

  let events: Pick<LeadEvent, 'partner_id' | 'status' | 'revenue_cents'>[] = [];
  try {
    const { data } = await svc
      .from('lead_events')
      .select('partner_id, status, revenue_cents');
    events = (data ?? []) as Pick<
      LeadEvent,
      'partner_id' | 'status' | 'revenue_cents'
    >[];
  } catch {
    events = [];
  }

  const summary = summarizeLeadEvents(events);
  const stats: PartnerStats = summary.byPartner;
  const activeCount = partners.filter((p) => p.active).length;

  return (
    <div className="space-y-8">
      <header>
        <span className="badge-brand gap-1.5">
          <Handshake className="h-3.5 w-3.5" /> Partner desk
        </span>
        <h2 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">
          Referral partners
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          The services we route members to for a lead or referral fee. ClaimMatch
          stays free — partners pay us, never members. Add partners, set payout
          terms, and watch what each one earns.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Partners"
          value={<span className="tabular-nums">{partners.length.toLocaleString()}</span>}
          sub={`${activeCount.toLocaleString()} active`}
          icon={<Handshake className="h-4 w-4" />}
        />
        <StatCard
          label="Referral clicks"
          value={<span className="tabular-nums">{summary.clicks.toLocaleString()}</span>}
          sub={`${summary.leads.toLocaleString()} qualified`}
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <StatCard
          label="Conversions"
          value={<span className="tabular-nums">{summary.conversions.toLocaleString()}</span>}
          sub={`${Math.round(summary.conversionRate * 100)}% rate`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Revenue earned"
          value={<span className="tabular-nums">{centsToUSD(summary.revenueCents)}</span>}
          sub="lead + conversion fees"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Revenue paid"
          value={<span className="tabular-nums">{centsToUSD(summary.paidCents)}</span>}
          sub="settled by partners"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </section>

      <PartnerAdminTable partners={partners} stats={stats} />
    </div>
  );
}
