import { Info } from 'lucide-react';
import { legalDisclaimer } from '@/lib/disclaimer-flags';

/**
 * Reusable legal disclaimer box. Shown on claim + detail pages and legal pages.
 * A claim page passes its per-claim text (claimLegalDisclaimer).
 */
export function Disclaimer({ compact = false, text }: { compact?: boolean; text?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Info className="h-4 w-4 text-brand-600" aria-hidden /> Legal disclaimer
      </div>
      <p
        className={`mt-2 text-xs leading-relaxed text-ink-muted ${
          compact ? 'line-clamp-4' : ''
        }`}
      >
        {text ?? legalDisclaimer()}
      </p>
    </div>
  );
}
