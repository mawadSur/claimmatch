import { ArrowRight } from 'lucide-react';
import { SettlementQualifyCta } from '@/components/settlement/SettlementQualifyCta';
import { hidesFileQualifySignup } from '@/lib/claim-actions';
import { flags } from '@/lib/flags';

/** Mobile-only sticky bar. Desktop already has the sidebar CTA. Hidden when no claim is needed. */
export function StickyQualifyCta({
  href,
  slug,
  lawsuitId,
  claimActionType,
}: {
  href: string;
  slug: string;
  lawsuitId: string;
  claimActionType?: string | null;
}) {
  if (flags.claimActionCtas() && hidesFileQualifySignup(claimActionType)) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <SettlementQualifyCta
        href={href}
        slug={slug}
        lawsuitId={lawsuitId}
        className="btn-primary w-full justify-center"
      >
        Check if you qualify <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </SettlementQualifyCta>
    </div>
  );
}
