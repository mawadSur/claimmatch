import { Clock } from 'lucide-react';
import { closesInChip } from '@/lib/closing-soon';
import { flags } from '@/lib/flags';

/**
 * C11 "Closes in N days" chip. Real dates only; hidden when the flag is off
 * or there is no future deadline.
 */
export function ClosesInChip({
  deadline,
  now,
  className,
  enabled = flags.closesInChips(),
}: {
  deadline: string | null | undefined;
  now?: Date;
  className?: string;
  /** Server-passed flag so a client island hydrates the same as SSR. */
  enabled?: boolean;
}) {
  if (!enabled) return null;
  const label = closesInChip(deadline, now);
  if (!label) return null;

  return (
    <span className={className ?? 'badge-red gap-1'}>
      <Clock className="h-3 w-3" aria-hidden="true" /> {label}
    </span>
  );
}
