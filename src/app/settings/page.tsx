import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Download, Trash2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import { ReferralCard } from '@/components/ReferralCard';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings');

  const { error: errorFlag } = await searchParams;
  const deleteFailed = errorFlag === 'delete';

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

        {/* Your data — export + right-to-erasure controls. */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <div className="flex items-center gap-2 text-ink">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-bold">Your data</h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            ClaimMatch is free and we never take a cut of your recovery. You own your data —
            download a copy any time, or close your account and erase it for good.
          </p>

          <div className="mt-5 flex flex-col gap-3 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Export my data</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Your profile, claims, recoveries, matches, and referrals as a JSON file.
              </p>
            </div>
            <a href="/api/account/export" download className="btn-secondary shrink-0">
              <Download className="h-4 w-4" /> Download
            </a>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-ink">Delete my account</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Permanently removes your profile, claims, recoveries, matches, referrals, and
              login. This cannot be undone.
            </p>

            {deleteFailed && (
              <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
                We couldn’t delete your account. Please try again or contact support.
              </p>
            )}

            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-danger-700 ring-1 ring-danger-500/30 transition hover:bg-danger-50">
                <Trash2 className="h-4 w-4" />
                <span className="group-open:hidden">Delete my account</span>
                <span className="hidden group-open:inline">Keep my account (cancel)</span>
              </summary>
              <div className="mt-3 rounded-xl border border-danger-500/30 bg-danger-50 p-4">
                <p className="text-sm font-semibold text-danger-700">
                  Are you sure? This permanently erases your data and signs you out. To cancel,
                  click “Keep my account” above.
                </p>
                <form method="post" action="/api/account/delete" className="mt-4">
                  <button
                    type="submit"
                    className="btn bg-danger-500 text-white hover:bg-danger-700 active:scale-[.98]"
                  >
                    <Trash2 className="h-4 w-4" /> Yes, delete everything
                  </button>
                </form>
              </div>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
