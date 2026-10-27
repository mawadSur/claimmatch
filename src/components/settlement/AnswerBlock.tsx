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
        {facts.qualifies && <Fact label="Who qualifies" value={facts.qualifies} wide />}
        <Fact label="Listed payout" value={facts.payout} />
        {facts.deadline && <Fact label="Claim deadline" value={facts.deadline} />}
        <Fact label="Proof needed" value={facts.proof} />
        {facts.administrator && <Fact label="Administrator" value={facts.administrator} />}
      </dl>
      {facts.missing.length > 0 && (
        <MissingDetailsBlock missing={facts.missing} official={official} />
      )}
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

export function MissingDetailsBlock({
  missing,
  official,
}: {
  missing: string[];
  official: CatalogLink | null;
}) {
  if (missing.length === 0) return null;
  const list = missing.join(', ');
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink">
      <p>
        We don&apos;t have these details yet: {list}. Check the official notice
        {official ? (
          <>
            {' '}
            (
            <a
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {official.kind === 'official' ? official.host : official.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            )
          </>
        ) : (
          '.'
        )}
      </p>
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
