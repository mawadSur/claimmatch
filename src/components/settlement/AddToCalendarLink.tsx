import { CalendarPlus } from 'lucide-react';
import { flags } from '@/lib/flags';
import { deadlineIcsDate } from '@/lib/calendar-ics';

/** C9: download link for the all-day deadline .ics. Hidden without a date or flag. */
export function AddToCalendarLink({
  slug,
  deadline,
}: {
  slug: string;
  deadline: string | null | undefined;
}) {
  if (!flags.calendarIcs()) return null;
  if (!deadlineIcsDate(deadline)) return null;

  return (
    <a
      href={`/lawsuits/${encodeURIComponent(slug)}/calendar.ics`}
      className="mt-2 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
      Add deadline to calendar
    </a>
  );
}
