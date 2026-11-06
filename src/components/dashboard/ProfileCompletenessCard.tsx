import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import type { ProfileCompleteness } from '@/lib/profile-completeness';

export function ProfileCompletenessCard({ result }: { result: ProfileCompleteness }) {
  const n = result.unansweredCount;
  const m = result.additionalSettlements;
  const questionLabel = n === 1 ? 'question' : 'questions';
  const matchLabel = m === 1 ? 'match' : 'matches';

  return (
    <section
      aria-labelledby="profile-completeness-title"
      className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-white p-5 shadow-card sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <ListChecks className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 id="profile-completeness-title" className="text-base font-bold text-ink">
            Answer {n} more {questionLabel} to unlock ~{m} more {matchLabel}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
            Counts come from open listings in the catalog and the matcher questions
            you have not answered yet. They are not payment amounts.
          </p>
        </div>
      </div>
      <Link href="/onboarding" className="btn-primary shrink-0">
        Finish profile <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
