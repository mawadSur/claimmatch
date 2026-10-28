import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import { isDeadlinePassed } from '@/lib/utils';
import {
  draftEligibilityForLawsuit,
  listingSourceText,
} from '@/lib/eligibility-draft';
import type { EligibilityRuleDraft, Lawsuit } from '@/lib/types';

export interface DraftEligibilityRunSummary {
  considered: number;
  drafted: number;
  skippedStructured: number;
  skippedClosed: number;
  failed: number;
}

function isOpenFuture(lawsuit: Pick<Lawsuit, 'status' | 'deadline'>, now: Date): boolean {
  if (lawsuit.status === 'closed' || lawsuit.status === 'draft') return false;
  if (!lawsuit.deadline) return false;
  return !isDeadlinePassed(lawsuit.deadline, now);
}

/** Write pending drafts for open settlements with a future deadline and no structured rules. */
export async function persistEligibilityDrafts(
  opts: { now?: Date; enabled?: boolean } = {},
): Promise<DraftEligibilityRunSummary> {
  const enabled = opts.enabled ?? flags.eligibilityDrafts();
  const summary: DraftEligibilityRunSummary = {
    considered: 0,
    drafted: 0,
    skippedStructured: 0,
    skippedClosed: 0,
    failed: 0,
  };
  if (!enabled) return summary;

  const now = opts.now ?? new Date();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('lawsuits')
    .select('id, title, summary, description, eligibility_text, eligibility, status, deadline, review_status')
    .neq('status', 'closed')
    .neq('status', 'draft')
    .not('deadline', 'is', null);
  if (error || !data) {
    console.error('[eligibility-drafts] load failed', { code: error?.code });
    summary.failed += 1;
    return summary;
  }

  for (const raw of data) {
    const lawsuit = raw as Lawsuit;
    summary.considered += 1;
    if (!isOpenFuture(lawsuit, now)) {
      summary.skippedClosed += 1;
      continue;
    }
    const draft = draftEligibilityForLawsuit(lawsuit);
    if (!draft) {
      summary.skippedStructured += 1;
      continue;
    }
    const excerpt = listingSourceText(lawsuit).slice(0, 2000);
    const payload = {
      lawsuit_id: lawsuit.id,
      eligibility: draft.eligibility,
      eligibility_text: lawsuit.eligibility_text,
      source_excerpt: excerpt,
      rationale: draft.rationale,
      status: 'pending' as const,
    };
    const { data: existing } = await svc
      .from('eligibility_rule_drafts')
      .select('id')
      .eq('lawsuit_id', lawsuit.id)
      .eq('status', 'pending')
      .maybeSingle();
    const write = existing
      ? await svc
          .from('eligibility_rule_drafts')
          .update({
            eligibility: payload.eligibility,
            eligibility_text: payload.eligibility_text,
            source_excerpt: payload.source_excerpt,
            rationale: payload.rationale,
          })
          .eq('id', existing.id)
      : await svc.from('eligibility_rule_drafts').insert(payload);
    if (write.error) {
      summary.failed += 1;
      continue;
    }
    summary.drafted += 1;
  }

  return summary;
}

export async function listPendingEligibilityDrafts(): Promise<
  Array<EligibilityRuleDraft & { lawsuit_title?: string; lawsuit_slug?: string; deadline?: string | null }>
> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('eligibility_rule_drafts')
      .select('*, lawsuit:lawsuits(title, slug, deadline)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as Array<EligibilityRuleDraft & { lawsuit?: { title?: string; slug?: string; deadline?: string | null } }>).map(
      (row) => ({
        ...row,
        lawsuit_title: row.lawsuit?.title,
        lawsuit_slug: row.lawsuit?.slug,
        deadline: row.lawsuit?.deadline,
      }),
    );
  } catch {
    return [];
  }
}

export async function reviewEligibilityDraft(input: {
  id: string;
  action: 'approve' | 'reject';
  reviewerId: string;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!flags.eligibilityDrafts()) {
    return { ok: false, error: 'Eligibility drafts are turned off.' };
  }
  const svc = createServiceClient();
  const { data: draft, error } = await svc
    .from('eligibility_rule_drafts')
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (error || !draft) return { ok: false, error: 'Draft not found.' };
  if (draft.status !== 'pending') return { ok: false, error: 'This draft was already reviewed.' };

  const now = new Date().toISOString();
  if (input.action === 'approve') {
    const { error: lawsuitError } = await svc
      .from('lawsuits')
      .update({ eligibility: draft.eligibility })
      .eq('id', draft.lawsuit_id);
    if (lawsuitError) {
      console.error('[eligibility-drafts] publish failed', { code: lawsuitError.code });
      return { ok: false, error: 'Could not save the approved rules.' };
    }
  }

  const { error: reviewError } = await svc
    .from('eligibility_rule_drafts')
    .update({
      status: input.action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      review_notes: input.notes ?? null,
    })
    .eq('id', input.id)
    .eq('status', 'pending');
  if (reviewError) {
    return { ok: false, error: 'Could not update the draft.' };
  }
  return { ok: true };
}
