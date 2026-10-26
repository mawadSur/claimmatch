import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { CatalogLink } from '@/lib/lawsuits';
import type { AnswerFacts } from '@/lib/settlement-seo';

export function AnswerBlock({
  facts,
  open,
  claimHref,
  official,
}: {
  facts: AnswerFacts;
  open: boolean;
  claimHref: string;
  official: CatalogLink | null;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-lg font-bold">The short answer</h2>
      <p className="mt-1 text-sm text-ink-muted">
        From our listing. Confirm every detail on the official notice before you file.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Fact label="Who qualifies" value={facts.qualifies} wide />
        <Fact label="Listed payout" value={facts.payout} />
        <Fact label="Claim deadline" value={facts.deadline} />
        <Fact label="Proof needed" value={facts.proof} />
        <Fact label="Administrator" value={facts.administrator} />
      </dl>
      {open && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href={claimHref} className="btn-primary justify-center">
            Check if you qualify <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {official?.kind === 'official' && (
            <a
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary justify-center"
            >
              Official claim site ({official.host})
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  );
}
