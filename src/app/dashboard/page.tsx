import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, DollarSign, FileText, Search, Sparkles, Target, UserCog,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Claim, Match, Profile } from '@/lib/types';
import { LawsuitCard } from '@/components/LawsuitCard';
import { ClaimCard } from '@/components/ClaimCard';
import { RefreshMatches } from '@/components/RefreshMatches';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  // Profile — a DB trigger creates this on signup, but degrade gracefully.
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const profile = (profileData as Profile | null) ?? null;

  // Matches (active) + claims, both with their joined lawsuit.
  const [{ data: matchesData }, { data: claimsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*, lawsuit:lawsuits(*)')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .order('score', { ascending: false }),
    supabase
      .from('claims')
      .select('*, lawsuit:lawsuits(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const matches = ((matchesData ?? []) as unknown as Match[]).filter(
    (m): m is Match & { lawsuit: NonNullable<Match['lawsuit']> } => Boolean(m.lawsuit),
  );
  const claims = (claimsData ?? []) as unknown as Claim[];

  const displayName =
    profile?.full_name?.trim() || user.email?.split('@')[0] || 'there';

  const openMatches = matches.length;
  const activeClaims = claims.filter(
    (c) => c.status !== 'rejected' && c.status !== 'paid',
  ).length;
  const opportunities = openMatches + claims.length;

  return (
    <div className="bg-gray-50">
      <div className="container-page py-10 sm:py-14">
        {/* Greeting ---------------------------------------------------------- */}
        <header className="reveal">
          <span className="badge-brand gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Your dashboard
          </span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Here are the settlements matched to your profile and the claims
            you’ve filed. We’ll email you the moment new matches open up.
          </p>
        </header>

        {/* Onboarding nudge -------------------------------------------------- */}
        {!profile?.onboarded && (
          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-card sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Finish setting up your profile
                </h2>
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Answer a few quick questions so we can match you to the
                  settlements you actually qualify for. It takes about 2 minutes.
                </p>
              </div>
            </div>
            <Link href="/onboarding" className="btn-primary shrink-0">
              Finish setup <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Summary stats ----------------------------------------------------- */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Target className="h-5 w-5" />}
            value={String(openMatches)}
            label={openMatches === 1 ? 'Open match' : 'Open matches'}
            tone="brand"
          />
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            value={String(activeClaims)}
            label={activeClaims === 1 ? 'Active claim' : 'Active claims'}
            tone="ink"
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            value={opportunities > 0 ? 'Money on the table' : '$0'}
            label={
              opportunities > 0
                ? `Across ${opportunities} ${opportunities === 1 ? 'opportunity' : 'opportunities'}`
                : 'No opportunities yet'
            }
            tone="success"
          />
        </div>

        {/* Matched settlements ---------------------------------------------- */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="badge-brand gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Matched to you
              </span>
              <h2 className="mt-3 text-2xl font-extrabold">
                Settlements matched to you
              </h2>
            </div>
            <RefreshMatches />
          </div>

          {matches.length > 0 ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {matches.map((m) => (
                <LawsuitCard
                  key={m.id}
                  lawsuit={m.lawsuit}
                  badge={{
                    label: `Matched ${Math.round(m.score * 100)}%`,
                    tone: 'brand',
                  }}
                  reasons={m.reasons}
                  href={`/claim/${m.lawsuit.slug}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Target className="h-6 w-6" />}
              title="No matches yet"
              body={
                profile?.onboarded
                  ? 'We haven’t found a settlement that fits your profile yet. Refresh your matches or browse all open settlements.'
                  : 'Finish setting up your profile so we can match you to the settlements you qualify for.'
              }
              primary={
                profile?.onboarded
                  ? { href: '/lawsuits', label: 'Browse settlements' }
                  : { href: '/onboarding', label: 'Finish setup' }
              }
              secondary={
                profile?.onboarded
                  ? undefined
                  : { href: '/lawsuits', label: 'Browse settlements' }
              }
            />
          )}
        </section>

        {/* Filed claims ------------------------------------------------------ */}
        <section className="mt-14">
          <div>
            <span className="badge-gray gap-1">
              <FileText className="h-3.5 w-3.5" /> Your filings
            </span>
            <h2 className="mt-3 text-2xl font-extrabold">Your claims</h2>
          </div>

          {claims.length > 0 ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {claims.map((c) => (
                <ClaimCard key={c.id} claim={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="You haven’t filed any claims yet"
              body="When you file a claim, it’ll show up here with a receipt number so you can track its status."
              primary={{ href: '/lawsuits', label: 'Browse settlements' }}
            />
          )}
        </section>

        <div className="mt-14">
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: 'brand' | 'success' | 'ink';
}) {
  const iconClass =
    tone === 'brand'
      ? 'bg-brand-100 text-brand-700'
      : tone === 'success'
        ? 'bg-success-50 text-success-600'
        : 'bg-gray-100 text-ink';
  const valueClass = tone === 'success' ? 'text-success-600' : 'text-ink';

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`truncate text-xl font-extrabold ${valueClass}`}>{value}</div>
        <div className="text-sm text-ink-muted">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-card">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{body}</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={primary.href} className="btn-primary">
          {primary.label} <ArrowRight className="h-4 w-4" />
        </Link>
        {secondary && (
          <Link href={secondary.href} className="btn-secondary">
            <Search className="h-4 w-4" /> {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
