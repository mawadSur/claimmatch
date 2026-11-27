/**
 * Apply a 24-hour did-you-file signed link: mark the claim reported_filed.
 * No login. Scanners must not call this (POST only).
 */
import { planClaimTransition, toClaimView, type ClaimView } from '@/lib/claims';
import {
  applyClaimPlan,
  claimContext,
  loadSettlementById,
  serviceRoleConfigured,
} from '@/lib/claims-server';
import { filedSigningSecret, parseFiledToken } from '@/lib/filed-link';
import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';

export type ApplyFiledResult =
  | { ok: true; claim: ClaimView; noop: boolean }
  | { ok: false; status: 400 | 404 | 409 | 503; error: string };

export async function applyFiledToken(raw: unknown, now: Date = new Date()): Promise<ApplyFiledResult> {
  if (!flags.didYouFileEmail()) {
    return { ok: false, status: 404, error: 'This link is not available.' };
  }
  const secret = filedSigningSecret();
  if (!secret) return { ok: false, status: 503, error: 'This link is not available right now.' };
  const parsed = parseFiledToken(raw, secret, now);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: 'This link is missing or has expired. Open the email again.' };
  }
  if (!serviceRoleConfigured()) {
    return { ok: false, status: 503, error: 'We couldn’t save that just now. Please try again.' };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('id', parsed.claimId)
    .eq('user_id', parsed.userId)
    .eq('lawsuit_id', parsed.lawsuitId)
    .maybeSingle();
  if (error) {
    console.error('[filed] claim read failed', { code: error.code });
    return { ok: false, status: 503, error: 'We couldn’t save that just now. Please try again.' };
  }
  if (!data) return { ok: false, status: 404, error: 'We could not find that claim.' };

  const claim = toClaimView(data as Record<string, unknown>);
  const lookup = await loadSettlementById(parsed.lawsuitId);
  if (!lookup.ok) {
    return { ok: false, status: 503, error: 'We couldn’t save that just now. Please try again.' };
  }
  const plan = planClaimTransition(claim, { action: 'report_filed' }, claimContext(lookup.settlement, now), now);
  if (!plan.ok) {
    return { ok: false, status: 409, error: plan.message };
  }
  if (plan.noop) return { ok: true, claim, noop: true };
  if (!plan.plan) return { ok: false, status: 409, error: 'That change is not possible for this claim.' };
  const written = await applyClaimPlan({
    claimId: parsed.claimId,
    userId: parsed.userId,
    plan: plan.plan,
    detail: { via: 'did_you_file_24h' },
  });
  if (!written.ok) {
    const status = written.status === 409 || written.status === 404 || written.status === 503 ? written.status : 503;
    return { ok: false, status, error: written.error };
  }
  return { ok: true, claim: written.claim, noop: false };
}
