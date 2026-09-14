import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import type { Lawsuit } from '@/lib/types';
import { ReviewQueue } from '@/components/admin/ReviewQueue';

export const metadata: Metadata = { title: 'Review queue' };

export const dynamic = 'force-dynamic';

/**
 * Human-in-the-loop review of LLM-extracted settlements. Lowest-confidence
 * extractions surface first so the riskiest rows get eyes before anything goes
 * live to the public.
 */
export default async function AdminReviewPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/review');
  const svc = createServiceClient();

  let items: Lawsuit[] = [];
  try {
    const { data } = await svc
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'pending_review')
      .order('extraction_confidence', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false });
    items = (data ?? []) as Lawsuit[];
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
        </p>
      </header>

      <ReviewQueue items={items} />
    </div>
  );
}
