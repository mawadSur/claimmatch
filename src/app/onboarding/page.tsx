import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CheckCircle2, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { safeNextOr } from '@/lib/safe-next';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { flags } from '@/lib/flags';
import { ConfirmEmailBanner } from '@/components/ConfirmEmailBanner';
import { MAY_FILE_PAGE_COPY, onboardingIntroCopy, WHAT_WE_STORE_MINIMAL } from '@/lib/copy';
import { viewerMayFile } from '@/lib/filing/public-filing';
import { factsFromRows } from '@/lib/profile-facts';
import { answersFromAttributes } from '@/lib/profile-attributes';
import { MATCH_PREVIEW_COOKIE, mergePreviewIntoAnswers, parsePreviewCookie } from '@/lib/match-preview';

export function generateMetadata(): Metadata {
  return {
    title: 'Set up your profile',
    description: flags.feeDisclosure()
      ? 'Add a few details to your Lawsuit AI account.'
      : 'Add a few details to your free Lawsuit AI account.',
    robots: { index: false, follow: false },
  };
}

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
  searchParams: Promise<{ next?: string | string[]; confirmed?: string | string[] }>;
}) {
  const { next, confirmed } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');
  // Only a path on this site, so the redirect after onboarding can't leave it.
  const destination = safeNextOr(next, '/dashboard?welcome=1');
  const emailConfirmed = confirmed === '1' || (Array.isArray(confirmed) && confirmed[0] === '1');

  // Who files (issue #53): per viewer, so a one-click tester sees the one-click text in test mode.
  const mayFile = viewerMayFile({ kind: 'member', email: user.email });
  const disclose = flags.feeDisclosure();
  const howItWorks = mayFile
    ? HOW_IT_WORKS.map((step, i) =>
        i === 2
          ? disclose
            ? MAY_FILE_PAGE_COPY.onboardingStepMembership
            : MAY_FILE_PAGE_COPY.onboardingStep
          : step,
      )
    : HOW_IT_WORKS;
  const profileV2 = flags.profileV2();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, state, attributes')
    .eq('id', user.id)
    .maybeSingle();
  const { data: factRows } = profileV2
    ? await supabase
        .from('profile_facts')
        .select('type, value, start_date, end_date, source')
        .eq('user_id', user.id)
    : { data: [] };

  // /preview answers also travel in a short-lived cookie, so a confirmation
  // link opened in another browser (where localStorage is gone) still arrives
  // with something to prefill. Saved profile values always win.
  const previewDraft = parsePreviewCookie((await cookies()).get(MATCH_PREVIEW_COOKIE)?.value);
  const savedAttributes = (profile?.attributes as Record<string, unknown> | null) ?? {};
  const initialAttributes: Record<string, unknown> = previewDraft
    ? mergePreviewIntoAnswers(answersFromAttributes(savedAttributes), previewDraft)
    : savedAttributes;

  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-12 sm:py-16">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden /> About 1 minute
            </span>
            <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">Welcome to Lawsuit AI</h1>
            <p className="mt-3 leading-relaxed text-ink-muted">
              {onboardingIntroCopy(mayFile, disclose)} Here&rsquo;s how it works:
            </p>
          </div>

          <ol className="mt-6 space-y-2 rounded-2xl border border-gray-100 bg-white p-5 text-sm leading-relaxed text-ink shadow-card">
            {howItWorks.map((step, i) => (
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

          {!user.email_confirmed_at && !emailConfirmed && (
            <div className="mt-6">
              <ConfirmEmailBanner email={user.email ?? null} />
            </div>
          )}

          {emailConfirmed && (
            <>
              <CaptureOnce event="signup_completed" properties={{ evidence: 'email_confirmed' }} />
              <div
                role="status"
                className="mt-6 flex items-start gap-2 rounded-2xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-800"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">Email confirmed.</span> Finish a couple of
                  optional details so we can find settlements that may apply to you.
                </span>
              </div>
            </>
          )}

          <div className="mt-6">
            <OnboardingWizard
              initial={{
                fullName: profile?.full_name ?? '',
                state: profile?.state || previewDraft?.state || '',
                attributes: initialAttributes,
                facts: factsFromRows(factRows),
              }}
              email={user.email ?? null}
              next={destination}
              profileV2={profileV2}
              storeNote={flags.panelTrustCopy() ? WHAT_WE_STORE_MINIMAL : undefined}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
