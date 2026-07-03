import { Info } from 'lucide-react';
import { LEGAL_DISCLAIMER } from '@/lib/disclaimer';

/** Reusable legal disclaimer box. Shown on claim + detail pages and legal pages. */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Info className="h-4 w-4 text-brand-600" /> Legal disclaimer
      </div>
      <p
        className={`mt-2 text-xs leading-relaxed text-ink-soft ${
          compact ? 'line-clamp-4' : ''
        }`}
      >
        {LEGAL_DISCLAIMER}
      </p>
    </div>
  );
}
