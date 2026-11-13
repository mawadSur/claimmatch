import type { Metadata } from 'next';
import { BadgeCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import type { Lawsuit } from '@/lib/types';
import { VerifyQueue } from '@/components/admin/VerifyQueue';
import { tallyProofFeedback, type ProofFeedbackCounts } from '@/lib/proof-feedback';
import { flags } from '@/lib/flags';
import {
  listVerificationDraftsByLawsuitIds,
  type VerificationDraft,
} from '@/lib/verification-drafts-store';
import { loadVerifyQueueStats, sortVerifyQueue } from '@/lib/verification-draft-ui';

export const metadata: Metadata = { title: 'Verify listings' };

export const dynamic = 'force-dynamic';

/**
 * Admin editor for verified fields on published (and pending) listings.
 * Public "Verified on" badges stay off until VERIFIED_FIELDS_ENABLED=1.
 */
export default async function AdminVerifyPage() {
  await requireAdmin('/admin/verify');
  const svc = createServiceClient();
  const assistEnabled = flags.verifyAssist();

  let items: Lawsuit[] = [];
  let feedbackCounts = new Map<string, ProofFeedbackCounts>();
  let drafts: Record<string, VerificationDraft> = {};
  let stats: Record<string, { matchCount: number; viewCount: number }> = {};
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
      if (assistEnabled) {
        const draftMap = await listVerificationDraftsByLawsuitIds(ids);
        drafts = Object.fromEntries(draftMap);
        stats = await loadVerifyQueueStats(svc as never, ids);
        items = sortVerifyQueue(
          items.map((lawsuit) => ({ lawsuit })),
          stats,
        ).map((row) => row.lawsuit);
      }
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
          {assistEnabled
            ? ' Site-check drafts stay on this page only — they never go public or stamp verified on their own.'
            : ''}
        </p>
      </header>

      <VerifyQueue
        items={items}
        feedbackCounts={Object.fromEntries(feedbackCounts)}
        drafts={drafts}
        stats={stats}
        assistEnabled={assistEnabled}
      />
    </div>
  );
}
