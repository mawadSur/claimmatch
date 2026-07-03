import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import { ReferralCard } from '@/components/ReferralCard';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // Degrade gracefully if the profile row hasn't been created yet.
  const profile: Profile =
    (profileData as Profile | null) ??
    ({
      id: user.id,
      email: user.email ?? null,
      full_name: '',
      state: null,
      zip: null,
      attributes: {},
      email_opt_in: true,
      onboarded: false,
      is_admin: false,
      phone: null,
      sms_opt_in: false,
      referral_code: null,
      referred_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Profile);

  return (
    <div className="container-narrow py-12">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <p className="mt-2 text-ink-muted">Manage how we reach you and share ClaimMatch.</p>

      <div className="mt-8 space-y-6">
        <NotificationPrefs profile={profile} />
        <ReferralCard code={profile.referral_code} />
      </div>
    </div>
  );
}
