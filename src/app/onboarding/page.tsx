import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { ELIGIBILITY_QUESTIONS } from '@/lib/eligibility';
import { OnboardingWizard } from '@/components/OnboardingWizard';

export const metadata: Metadata = {
  title: 'Set up your profile',
  description:
    'Answer a few quick questions so ClaimMatch can match you to the settlements you qualify for.',
};

export default function OnboardingPage() {
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow py-14 sm:py-20">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Takes about 2 minutes
            </span>
            <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">
              Let’s find your matches
            </h1>
            <p className="mt-3 text-ink-muted">
              Answer a few quick questions once. We compare your profile to every
              open case and surface the settlements you actually qualify for. Your
              answers are private and only used to match you.
            </p>
          </div>

          <div className="mt-8">
            <OnboardingWizard questions={ELIGIBILITY_QUESTIONS} />
          </div>
        </div>
      </div>
    </section>
  );
}
