import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { safeNextOr } from '@/lib/safe-next';
import { OnboardingWizard } from '@/components/OnboardingWizard';

export const metadata: Metadata = {
  title: 'Set up your profile',
  description: 'Add a few details to your free ClaimMatch account.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const HOW_IT_WORKS = [
  'Find an open settlement in our list.',
  'Read the official notice to see if you qualify.',
  'File on the official site. It’s free, and you do it yourself.',
  'Tell us you filed. We keep your deadline and confirmation number in one place.',
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');
  // Only a path on this site, so the redirect after onboarding can't leave it.
  const destination = safeNextOr(next, '/dashboard?welcome=1');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, state, zip')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-12 sm:py-16">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden /> About 1 minute
            </span>
            <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">Welcome to ClaimMatch</h1>
            <p className="mt-3 leading-relaxed text-ink-muted">
              ClaimMatch is a free claim assistant. It never files for you and never
              takes a cut. Here&rsquo;s how it works:
            </p>
          </div>

          <ol className="mt-6 space-y-2 rounded-2xl border border-gray-100 bg-white p-5 text-sm leading-relaxed text-ink shadow-card">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700"
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <OnboardingWizard
              initial={{
                fullName: profile?.full_name ?? '',
                state: profile?.state ?? '',
                zip: profile?.zip ?? '',
              }}
              email={user.email ?? null}
              next={destination}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
