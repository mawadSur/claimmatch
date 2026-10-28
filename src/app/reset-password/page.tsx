import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** Reached from a verified recovery link, which signs the person in. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/forgot-password?link=expired');

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <h1 className="text-center text-3xl font-extrabold">Choose a new password</h1>
          <p className="mt-2 text-center text-ink-muted">You&rsquo;ll use it the next time you log in.</p>
          <div className="mt-8">
            <ResetPasswordForm />
          </div>
        </div>
      </div>
    </section>
  );
}
