import { CalendarClock } from 'lucide-react';
import type { ClaimTimelineView } from '@/lib/claim-timeline';

/** Simple after-you-file steps. Hearing and payment values are never guessed. */
export function ClaimTimeline({ timeline }: { timeline: ClaimTimelineView }) {
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-brand-100 pl-4">
      {timeline.steps.map((step) => (
        <li key={step.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{step.label}</p>
          <p className={step.known ? 'text-sm text-ink' : 'text-sm text-ink-muted'}>{step.value}</p>
        </li>
      ))}
    </ol>
  );
}

export function ClaimTimelineCard({
  timeline,
  title,
}: {
  timeline: ClaimTimelineView;
  title?: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
        {title ?? 'After you filed'}
      </p>
      <ClaimTimeline timeline={timeline} />
    </div>
  );
}
