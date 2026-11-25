import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { flags } from '@/lib/flags';
import { createClient } from '@/lib/supabase/server';
import { loadClaimProfile } from '@/lib/claim-profile-server';
import { ClaimProfileForm } from '@/components/claim-profile/ClaimProfileForm';

export const metadata: Metadata = { title: 'Build your claim profile' };
export const dynamic = 'force-dynamic';

export default async function ClaimProfilePage() {
  if (!flags.claimProfile()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings/claim-profile');

  const profile = await loadClaimProfile(supabase, user.id, {
    email: user.email ?? null,
  });

  return (
    <div className="container-narrow py-12">
      <p className="text-sm text-ink-muted">
        <Link href="/settings" className="font-semibold text-brand-700 underline hover:text-brand-800">
          Settings
        </Link>
        <span aria-hidden> / </span>
        Claim profile
      </p>
      <h1 className="mt-3 text-3xl font-extrabold">Build your claim profile</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Name, addresses, payment-method preference, and other details official
        claim forms commonly ask for. We reuse this to prefill packets. We never
        store a Social Security number or full bank account number.
      </p>
      <div className="mt-8">
        <ClaimProfileForm initial={profile} />
      </div>
    </div>
  );
}
