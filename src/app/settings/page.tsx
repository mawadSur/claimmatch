import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { legalContact } from '@/lib/legal-contact';
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

  const contact = legalContact();

  return (
    <div className="container-narrow py-12">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <p className="mt-2 text-ink-muted">Update your details and choose which emails you get.</p>

      <div className="mt-8 space-y-6">
        <NotificationPrefs profile={profile} />

        <section
          aria-labelledby="your-data"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card"
        >
          <h2 id="your-data" className="text-lg font-bold">Your data</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Our{' '}
            <Link href="/privacy" className="font-semibold text-brand-700 underline hover:text-brand-800">
              Privacy Policy
            </Link>{' '}
            explains what we store and why. You can ask us for a copy of your
            information, or ask us to delete your account
            {contact.email ? (
              <>
                {' '}by emailing{' '}
                <a
                  href={`mailto:${contact.email}`}
                  className="font-semibold text-brand-700 underline hover:text-brand-800"
                >
                  {contact.email}
                </a>
              </>
            ) : null}
            .
          </p>
        </section>

        <ReferralCard code={profile.referral_code} />
      </div>
    </div>
  );
}
