import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { flags } from '@/lib/flags';
import { factsFromRows } from '@/lib/profile-facts';
import { createClient } from '@/lib/supabase/server';
import { ProfileFactsEditor } from '@/components/ProfileFactsEditor';

export const metadata: Metadata = { title: 'My profile' };
export const dynamic = 'force-dynamic';

export default async function MyProfilePage() {
  if (!flags.profileV2()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings/profile');

  const { data: rows } = await supabase
    .from('profile_facts')
    .select('id, type, value, start_date, end_date, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div className="container-narrow py-12">
      <p className="text-sm text-ink-muted">
        <Link href="/settings" className="font-semibold text-brand-700 underline hover:text-brand-800">
          Settings
        </Link>
        <span aria-hidden> / </span>
        My profile
      </p>
      <h1 className="mt-3 text-3xl font-extrabold">My profile</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Brands, products, accounts, employers, locations, and purchases we can
        use to find settlements that may apply to you. Dates are optional.
      </p>
      <div className="mt-8">
        <ProfileFactsEditor initial={factsFromRows(rows)} />
      </div>
    </div>
  );
}
