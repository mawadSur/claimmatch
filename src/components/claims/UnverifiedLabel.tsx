import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const UNVERIFIED_LABEL = 'Unverified: check the official site';

/**
 * D50 interim label for every settlement until records are verified. The
 * catalog pages and LawsuitCard render the same text inline.
 */
export function UnverifiedLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'badge gap-1 bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {UNVERIFIED_LABEL}
    </span>
  );
}
