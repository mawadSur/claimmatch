import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Search, Sparkles, Target, UserCog, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Claim, Match, Profile } from '@/lib/types';
import { LawsuitCard } from '@/components/LawsuitCard';
import { PreparePacketsButton } from '@/components/PreparePacketsButton';
import { RefreshMatches } from '@/components/RefreshMatches';
import { Disclaimer } from '@/components/Disclaimer';
import { CLAIM_STATUS_LABELS } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';

export const metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const profile = (profileData as Profile | null) ?? null;

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
  const claims = (claimsData ?? []) as Claim[];

  const displayName =
    profile?.full_name?.trim() || user.email?.split('@')[0] || 'there';

  const claimedIds = new Set(claims.map((c) => c.lawsuit_id));
  const freshMatches = matches.filter((m) => !claimedIds.has(m.lawsuit_id));

  const ready = claims.filter((c) => c.status === 'processing' && !c.user_submitted_at);
  const submitted = claims.filter(
    (c) => c.status === 'submitted' || Boolean(c.user_submitted_at),
  );
  const later = claims.filter((c) => c.status === 'approved' || c.status === 'paid');

  return (
    <div className="bg-gray-50">
      <div className="container-page py-10 sm:py-14">
        <header className="mb-8">
          <span className="badge-brand gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Your dashboard
          </span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Your matches and claim packets. You review every detail and submit on
            the official administrator site.
          </p>
        </header>

        {!profile?.onboarded && (
          <div className="mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-card sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Finish setting up your profile</h2>
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Answer a few questions so we can match settlements to you. About 2
                  minutes.
                </p>
              </div>
            </div>
            <Link href="/onboarding" className="btn-primary shrink-0">
              Finish setup <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="badge-brand gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Your matches
              </span>
              <h2 className="mt-3 text-2xl font-extrabold">Ready to pre-fill</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Open a packet, copy your details, and submit on the official site.
              </p>
            </div>
            <RefreshMatches />
          </div>

          {freshMatches.length > 0 ? (
            <>
              <div className="mt-6">
                <PreparePacketsButton count={freshMatches.length} />
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
                matches.length > 0 ? 'Every match has a packet' : 'No matches yet'
              }
              body={
                matches.length > 0
                  ? 'Nice work — every settlement we matched you to has a packet below.'
                  : profile?.onboarded
                    ? 'We haven’t found a settlement that fits your profile yet. Refresh your matches or browse open settlements.'
                    : 'Finish setting up your profile so we can find settlements you may qualify for.'
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

        <section className="mt-14">
          <span className="badge-gray gap-1">
            <FileText className="h-3.5 w-3.5" /> Your packets
          </span>
          <h2 className="mt-3 text-2xl font-extrabold">Claim packets</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Ready to submit → You submitted → Approved or paid if you tell us later.
          </p>

          {claims.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">No packets yet.</p>
          ) : (
            <div className="mt-6 space-y-8">
              <PacketGroup title="Ready to submit" items={ready} />
              <PacketGroup title="You submitted" items={submitted} />
              <PacketGroup title="Approved / paid" items={later} />
            </div>
          )}
        </section>

        <div className="mt-14">
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}

function PacketGroup({ title, items }: { title: string; items: Claim[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h3>
      <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-semibold text-ink">{c.lawsuit?.title || c.lawsuit_title}</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {CLAIM_STATUS_LABELS[c.status]}
                {c.user_submitted_at
                  ? ` · You submitted on ${formatDeadline(c.user_submitted_at)}`
                  : ''}
                {c.lawsuit?.deadline ? ` · Deadline ${formatDeadline(c.lawsuit.deadline)}` : ''}
              </p>
            </div>
            {c.lawsuit?.slug && (
              <Link href={`/claim/${c.lawsuit.slug}`} className="btn-secondary !py-2 !px-3 text-xs">
                {c.user_submitted_at ? 'View packet' : 'Pre-fill'}
              </Link>
            )}
          </li>
        ))}
      </ul>
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
