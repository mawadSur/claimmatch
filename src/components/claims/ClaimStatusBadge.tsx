import type { ClaimTone } from '@/lib/claims';
import { cn } from '@/lib/utils';

const TONE_CLASS: Record<ClaimTone, string> = {
  amber: 'badge bg-amber-100 text-amber-900',
  brand: 'badge-brand',
  green: 'badge-green',
  gray: 'badge-gray',
  red: 'badge-red',
};

/** A claim status badge. The label always comes from displayClaimStatus(). */
export function ClaimStatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: ClaimTone;
  className?: string;
}) {
  return <span className={cn(TONE_CLASS[tone], 'whitespace-normal text-left', className)}>{label}</span>;
}
