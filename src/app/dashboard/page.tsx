import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Search,
  Sparkles,
  Target,
  UserCog,
  Wallet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Claim, Match, Profile } from '@/lib/types';
import { LawsuitCard } from '@/components/LawsuitCard';
import { MoneyHero } from '@/components/MoneyHero';
import { RecoveryTracker } from '@/components/RecoveryTracker';
import { RecommendedServices } from '@/components/RecommendedServices';
import { FileAllButton } from '@/components/FileAllButton';
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

  // Matches (active) + claims (with recovery), each with their joined lawsuit.
  const [{ data: matchesData }, { data: claimsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*, lawsuit:lawsuits(*)')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .order('score', { ascending: false }),
    supabase
      .from('claims')
      .select('*, lawsuit:lawsuits(*), recovery:recoveries(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const matches = ((matchesData ?? []) as unknown as Match[]).filter(
    (m): m is Match & { lawsuit: NonNullable<Match['lawsuit']> } =>
      Boolean(m.lawsuit),
  );

  // PostgREST returns the (unique) recovery relation as an object, but normalize
  // defensively in case it arrives as a one-element array.
  const claims = ((claimsData ?? []) as unknown as (Claim & {
    recovery?: Claim['recovery'] | Claim['recovery'][];
  })[]).map((c) => ({
    ...c,
    recovery: Array.isArray(c.recovery) ? c.recovery[0] : c.recovery,
  })) as Claim[];

  const displayName =
    profile?.full_name?.trim() || user.email?.split('@')[0] || 'there';

  // Matches the user hasn't filed a claim on yet → the "file these now" queue.
  const claimedIds = new Set(claims.map((c) => c.lawsuit_id));
  const freshMatches = matches.filter((m) => !claimedIds.has(m.lawsuit_id));

  return (
    <div className="bg-gray-50">
      <div className="container-page py-10 sm:py-14">
        {/* Greeting ---------------------------------------------------------- */}
        <header className="mb-8">
          <span className="badge-brand gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Your dashboard
          </span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Here’s what you’re owed, the settlements ready to file, and the money
            you’re recovering.
          </p>
        </header>

        {/* Onboarding nudge -------------------------------------------------- */}
        {!profile?.onboarded && (
          <div className="mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-card sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Finish setting up your profile
                </h2>
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Answer a few quick questions so we can find every settlement
                  you qualify for — and show you exactly what you’re owed. Takes
                  about 2 minutes.
                </p>
              </div>
            </div>
            <Link href="/onboarding" className="btn-primary shrink-0">
              Finish setup <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* You're owed $X ---------------------------------------------------- */}
        <MoneyHero openMatches={freshMatches} claims={claims} />

        {/* File these now ---------------------------------------------------- */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="badge-brand gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Matched to you
              </span>
              <h2 className="mt-3 text-2xl font-extrabold">File these now</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Settlements you match but haven’t filed yet. Prepare them all in
                one tap — then submit on each official site.
              </p>
            </div>
            <RefreshMatches />
          </div>

          {freshMatches.length > 0 ? (
            <>
              <div className="mt-6">
                <FileAllButton
                  matches={freshMatches.map((m) => ({
                    lawsuit: m.lawsuit,
                    reasons: m.reasons,
                  }))}
                  defaultName={profile?.full_name || ''}
                />
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {freshMatches.map((m) => (
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
            </>
          ) : (
            <EmptyState
              icon={<Target className="h-6 w-6" />}
              title={
                matches.length > 0
                  ? 'You’ve filed all your matches'
                  : 'No matches yet'
              }
              body={
                matches.length > 0
                  ? 'Nice work — every settlement we matched you to is filed and tracked below. We’ll surface new ones the moment they open.'
                  : profile?.onboarded
                    ? 'We haven’t found a settlement that fits your profile yet. Refresh your matches or browse all open settlements.'
                    : 'Finish setting up your profile so we can find the settlements you qualify for and show you what you’re owed.'
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

        {/* Recovery tracker -------------------------------------------------- */}
        <section className="mt-14">
          <div>
            <span className="badge-gray gap-1">
              <Wallet className="h-3.5 w-3.5" /> Your recoveries
            </span>
            <h2 className="mt-3 text-2xl font-extrabold">Money you’re recovering</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Every claim you’ve filed, tracked from submission to payout.
            </p>
          </div>

          <div className="mt-8">
            <RecoveryTracker claims={claims} />
          </div>
        </section>

        {/* Recommended partner services (sponsored) -------------------------- */}
        <section className="mt-14">
          <RecommendedServices placement="dashboard" limit={2} />
        </section>

        <div className="mt-14">
          <Disclaimer compact />
        </div>
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
