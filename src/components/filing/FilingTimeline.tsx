/**
 * The claim's status as the member sees it: where it is on the path
 * (preparing, ready, signed, in line, filing, filed, confirmation number) and
 * every change so far with its time and who made it ("You" or "Lawsuit AI";
 * staff are never named). Built from the filing view's timeline
 * (claim_events), so the web and the app show the same history.
 */
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { TimelineEntry } from '@/lib/filing/v2/contract';
import { cn } from '@/lib/utils';
import { filingPath, timelineRows } from './filing-model';

export function FilingPath({ status }: { status: string }) {
  const steps = filingPath(status);
  if (!steps) return null;
  return (
    <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label={ONE_CLICK_COPY.steps.status}>
      {steps.map((step) => (
        <li
          key={step.status}
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold',
            step.state === 'upcoming' ? 'text-ink-muted' : 'text-ink',
          )}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          {step.state === 'done' ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden />
          ) : step.state === 'current' ? (
            <CircleDot className="h-4 w-4 text-brand-600" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 text-gray-300" aria-hidden />
          )}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function FilingTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  const rows = timelineRows(entries);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="filing-timeline-title" className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h3 id="filing-timeline-title" className="text-sm font-bold text-ink">
        {ONE_CLICK_COPY.timeline.title}
      </h3>
      <ol className="mt-3 space-y-3 border-l-2 border-brand-100 pl-4">
        {rows.map((row) => (
          <li key={row.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <time dateTime={row.at}>{row.when}</time> · {row.actor}
            </p>
            <p className="text-sm text-ink">{row.text}</p>
            {row.confirmation && <p className="text-sm text-ink-muted">#{row.confirmation}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
