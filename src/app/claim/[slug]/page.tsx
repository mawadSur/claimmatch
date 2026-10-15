import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { lookupLawsuitBySlug, computedLawsuitStatus, isClaimWindowClosed } from '@/lib/lawsuits';
import { createClient } from '@/lib/supabase/server';
import { ClaimPacket } from '@/components/ClaimPacket';
import { MatchViewTracker } from '@/components/MatchViewTracker';
import { formatDeadline, daysUntil, canonicalUrl } from '@/lib/utils';
import type { Claim, Profile } from '@/lib/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  if (result.status !== 'ok') return { title: 'Claim packet', robots: { index: false, follow: false } };
  return {
    title: `Claim packet · ${result.lawsuit.title}`,
    alternates: { canonical: canonicalUrl(`/claim/${slug}`) },
    robots: { index: false, follow: false },
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let userId: string | null = null;
  let profile: Profile | null = null;
  let claim: Claim | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const [{ data: profileData }, lookup] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        lookupLawsuitBySlug(slug),
      ]);
      profile = (profileData as Profile | null) ?? null;
      if (lookup.status === 'ok') {
        const { data: claimData } = await supabase
          .from('claims')
          .select('*')
          .eq('user_id', user.id)
          .eq('lawsuit_id', lookup.lawsuit.id)
          .maybeSingle();
        claim = (claimData as Claim | null) ?? null;
      }
    }
  } catch {
    userId = null;
  }

  if (!userId) redirect(`/login?next=/claim/${slug}`);

  const result = await lookupLawsuitBySlug(slug);
  if (result.status === 'gone' || result.status === 'missing') notFound();
  const lawsuit = result.lawsuit;
  if (isClaimWindowClosed(lawsuit)) {
    redirect(`/lawsuits/${lawsuit.slug}`);
  }

  const status = computedLawsuitStatus(lawsuit);
  const days = daysUntil(lawsuit.deadline);

  return (
    <section className="container-narrow py-12">
      <MatchViewTracker
        lawsuitId={lawsuit.id}
        lawsuitTitle={lawsuit.title}
        lawsuitSlug={lawsuit.slug}
      />
      <Link
        href={`/lawsuits/${lawsuit.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settlement
      </Link>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="badge-brand">{lawsuit.category}</span>
        <span className={status === 'closing_soon' ? 'badge-red' : 'badge-green'}>
          {status === 'closing_soon' ? 'Closing soon' : 'Open for claims'}
        </span>
        {days !== null && days >= 0 && days <= 30 && (
          <span className="badge-red gap-1">
            <Clock className="h-3 w-3" /> {days} day{days === 1 ? '' : 's'} left
          </span>
        )}
      </div>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight">{lawsuit.title}</h1>
      <p className="mt-2 text-ink-muted">
        Deadline {formatDeadline(lawsuit.deadline)}. ClaimMatch is not the
        administrator. Filing is free on the official site.
      </p>

      <div className="mt-8">
        <ClaimPacket lawsuit={lawsuit} profile={profile} initialClaim={claim} />
      </div>
    </section>
  );
}
