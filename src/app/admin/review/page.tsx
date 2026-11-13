import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import type { Lawsuit } from '@/lib/types';
import { ReviewQueue } from '@/components/admin/ReviewQueue';
import { flags } from '@/lib/flags';
import {
  listVerificationDraftsByLawsuitIds,
  type VerificationDraft,
} from '@/lib/verification-drafts-store';

export const metadata: Metadata = { title: 'Review queue' };

export const dynamic = 'force-dynamic';

/**
 * Human-in-the-loop review of LLM-extracted settlements. Lowest-confidence
 * extractions surface first so the riskiest rows get eyes before anything goes
 * live to the public.
 */
export default async function AdminReviewPage() {
  await requireAdmin('/admin/review');
  const svc = createServiceClient();

  let items: Lawsuit[] = [];
  let drafts: Record<string, VerificationDraft> = {};
  const assistEnabled = flags.verifyAssist();
  try {
    const { data } = await svc
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'pending_review')
      .order('extraction_confidence', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false });
    items = (data ?? []) as Lawsuit[];
    if (assistEnabled && items.length > 0) {
      const draftMap = await listVerificationDraftsByLawsuitIds(items.map((item) => item.id));
      drafts = Object.fromEntries(draftMap);
    }
  } catch {
    items = [];
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" /> Human review
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Review queue</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          SettleSignal extractions awaiting human review before going live.
          Lowest-confidence first — verify the details, fix the eligibility rules
          if needed, then publish or reject. Use bulk actions to clear the queue
          efficiently.
          {assistEnabled
            ? ' When a site-check draft says claims are closed (with evidence), Close it; when it is still open with a future deadline, Republish + verify. Nothing closes without that click.'
            : ''}
        </p>
      </header>

      <ReviewQueue items={items} drafts={drafts} assistEnabled={assistEnabled} />
    </div>
  );
}
