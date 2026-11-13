/**
 * Pure helpers for the admin verify-assist queue. No network.
 */
import type { Lawsuit } from '@/lib/types';
import { isProofVerified, type ProofVerified } from '@/lib/verified-fields';
import { daysUntil } from '@/lib/utils';
import type { VerificationDraft } from '@/lib/verification-drafts-store';
import { draftSuggestsClosed, draftSuggestsOpenFuture } from '@/lib/verification-draft';

export interface VerifyQueueStats {
  matchCount: number;
  viewCount: number;
}

export interface AssistEditorFields {
  eligibilityVerified: string;
  proofVerified: '' | ProofVerified;
  administrator: string;
}

export function applyAssistDraftToEditor<T extends AssistEditorFields>(
  current: T,
  draft: Pick<VerificationDraft, 'eligibility_verified' | 'proof_verified' | 'administrator'> | null,
): T {
  if (!draft) return current;
  const proof = draft.proof_verified && isProofVerified(draft.proof_verified) ? draft.proof_verified : current.proofVerified;
  return {
    ...current,
    eligibilityVerified: draft.eligibility_verified?.trim() || current.eligibilityVerified,
    proofVerified: proof,
    administrator: draft.administrator?.trim() || current.administrator,
  };
}

export function sortVerifyQueue<T extends { lawsuit: Pick<Lawsuit, 'verified_at' | 'deadline' | 'title' | 'id'> }>(
  rows: T[],
  stats: Record<string, VerifyQueueStats | undefined>,
  now: Date = new Date(),
): T[] {
  return [...rows].sort((a, b) => {
    const aVerified = Boolean(a.lawsuit.verified_at);
    const bVerified = Boolean(b.lawsuit.verified_at);
    if (aVerified !== bVerified) return aVerified ? 1 : -1;
    const aDays = daysUntil(a.lawsuit.deadline, now);
    const bDays = daysUntil(b.lawsuit.deadline, now);
    const aKey = aDays == null ? Number.POSITIVE_INFINITY : aDays;
    const bKey = bDays == null ? Number.POSITIVE_INFINITY : bDays;
    if (aKey !== bKey) return aKey - bKey;
    const aStats = stats[a.lawsuit.id];
    const bStats = stats[b.lawsuit.id];
    const aMatches = aStats?.matchCount ?? 0;
    const bMatches = bStats?.matchCount ?? 0;
    if (aMatches !== bMatches) return bMatches - aMatches;
    const aViews = aStats?.viewCount ?? 0;
    const bViews = bStats?.viewCount ?? 0;
    if (aViews !== bViews) return bViews - aViews;
    return a.lawsuit.title.localeCompare(b.lawsuit.title);
  });
}

export async function loadVerifyQueueStats(
  svc: { from: (table: string) => { select: (cols: string) => { in: (col: string, ids: string[]) => PromiseLike<{ data: unknown[] | null; error?: unknown }> } } },
  lawsuitIds: string[],
): Promise<Record<string, VerifyQueueStats>> {
  const stats: Record<string, VerifyQueueStats> = {};
  for (const id of lawsuitIds) stats[id] = { matchCount: 0, viewCount: 0 };
  if (lawsuitIds.length === 0) return stats;
  try {
    const matches = await svc.from('matches').select('lawsuit_id').in('lawsuit_id', lawsuitIds);
    for (const row of (matches.data ?? []) as Array<{ lawsuit_id?: string }>) {
      if (row.lawsuit_id && stats[row.lawsuit_id]) stats[row.lawsuit_id].matchCount += 1;
    }
  } catch {
    // Match counts are optional ranking only.
  }
  try {
    const views = await svc.from('match_events').select('lawsuit_id, type').in('lawsuit_id', lawsuitIds);
    for (const row of (views.data ?? []) as Array<{ lawsuit_id?: string; type?: string }>) {
      if (row.lawsuit_id && stats[row.lawsuit_id] && (row.type === 'view' || row.type === 'impression')) {
        stats[row.lawsuit_id].viewCount += 1;
      }
    }
  } catch {
    // View counts are optional ranking only.
  }
  return stats;
}

export function canCloseFromDraft(draft: VerificationDraft | null | undefined): boolean {
  return Boolean(draft && draft.status === 'pending' && draftSuggestsClosed(draft));
}

export function canRepublishFromDraft(
  draft: VerificationDraft | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(draft && draft.status === 'pending' && draftSuggestsOpenFuture(draft, now));
}

export const VERIFY_ASSIST_SHORTCUTS = {
  next: 'j',
  prev: 'k',
  accept: 'a',
  reject: 'r',
  close: 'c',
  republish: 'p',
} as const;
