import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { flags } from '@/lib/flags';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { MatchPreview } from '@/components/match-preview/MatchPreview';

export const metadata: Metadata = {
  title: 'See matching settlements',
  description:
    'Answer a few questions to see open class-action settlements that may apply to you. No account needed.',
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  if (!flags.matchPreview()) notFound();

  return (
    <section className="bg-brand-50">
      <div className="container-narrow py-12 sm:py-16">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow">Free preview</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            See matching settlements
          </h1>
          <p className="mt-3 text-ink-muted">
            A few questions the matcher already uses. No account needed to see
            results. This is not a decision that you qualify — the official
            notice has the rules.
          </p>
          <div className="mt-8">
            <MatchPreview
              signupContextEnabled={flags.signupContext()}
              feeNote={<FeeDisclosure compact />}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
