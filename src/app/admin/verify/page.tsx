import type { Metadata } from 'next';
import { BadgeCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import type { Lawsuit } from '@/lib/types';
import { VerifyQueue } from '@/components/admin/VerifyQueue';
import { tallyProofFeedback, type ProofFeedbackCounts } from '@/lib/proof-feedback';

export const metadata: Metadata = { title: 'Verify listings' };

export const dynamic = 'force-dynamic';

/**
 * Admin editor for verified fields on published (and pending) listings.
 * Public "Verified on" badges stay off until VERIFIED_FIELDS_ENABLED=1.
 */
export default async function AdminVerifyPage() {
  await requireAdmin('/admin/verify');
  const svc = createServiceClient();

  let items: Lawsuit[] = [];
  let feedbackCounts = new Map<string, ProofFeedbackCounts>();
  try {
    const { data } = await svc
      .from('lawsuits')
      .select('*')
      .in('review_status', ['published', 'pending_review'])
      .order('verified_at', { ascending: true, nullsFirst: true })
      .order('title', { ascending: true })
      .limit(100);
    items = (data ?? []) as Lawsuit[];
    const ids = items.map((item) => item.id);
    if (ids.length > 0) {
      const { data: feedback } = await svc
        .from('proof_feedback')
        .select('lawsuit_id, answer')
        .in('lawsuit_id', ids);
      feedbackCounts = tallyProofFeedback(feedback ?? []);
    }
  } catch {
    items = [];
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <BadgeCheck className="h-3.5 w-3.5" /> Verified fields
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Verify listings</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Check who qualifies, the proof rule, and the administrator against the
          official notice, then mark the row verified. The public badge does not
          appear until the verified-fields flag is on.
        </p>
      </header>

      <VerifyQueue
        items={items}
        feedbackCounts={Object.fromEntries(feedbackCounts)}
      />
    </div>
  );
}
