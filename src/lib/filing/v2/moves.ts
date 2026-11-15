/**
 * The member's own moves on a one-click claim: withdraw, finish on the
 * official site (self-file), reopen a signed claim to change it, and add the
 * administrator's confirmation number. Each goes through one database
 * function (withdrawFiling -> filing_move_claim; filing_record_confirmation),
 * so the job, the signature, the packet and the claim change together and
 * the change is logged. Nothing moves while the claim is being filed
 * (filing_in_progress). Repeats are no-ops by state. Server only.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { withdrawFiling } from './jobs';
import { contentOf, loadClaimContext } from './claim-context';
import { canMoveClaim, type FilingErrorCode } from './contract';
import { openForClaimsNow } from './environment';
import { dbErrorCode, fail, logFilingError, requestIdOf, type FilingCaller } from './http';
import { savePacket } from './persist';
import { viewResponse } from './start';

export type MemberMove = 'withdraw' | 'self_file' | 'reopen';

/** Member-safe reason codes stored on the event and the void (design section 4). */
const REASON: Readonly<Record<'self_file' | 'reopen', string>> = { self_file: 'member_choice', reopen: 'member_edit' };

function refusal(status: string): FilingErrorCode {
  return status === 'filing' ? 'filing_in_progress' : 'invalid_transition';
}

export async function moveClaim(args: {
  caller: FilingCaller;
  req: Request;
  claimId: string;
  move: MemberMove;
  /** withdraw only: the member's reason (WithdrawRequestSchema). */
  reason?: string;
}): Promise<Response> {
  const { caller, req, claimId, move } = args;
  const now = new Date();
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now });
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const status = ctx.claim.status;

  let to: 'withdrawn' | 'self_file' | 'preparing';
  if (move === 'withdraw') {
    if (status === 'withdrawn') return viewResponse({ caller, req, claimId });
    if (!(canMoveClaim(status, 'withdrawn') || status === 'self_file')) return fail(refusal(status));
    to = 'withdrawn';
  } else if (move === 'self_file') {
    if (status === 'self_file') return viewResponse({ caller, req, claimId });
    if (status === 'filing' || !canMoveClaim(status, 'self_file')) return fail(refusal(status));
    to = 'self_file';
  } else {
    if (status === 'preparing' || status === 'ready' || status === 'needs_you') return viewResponse({ caller, req, claimId });
    if (status !== 'signed' && status !== 'queued') return fail(refusal(status));
    if (!openForClaimsNow(ctx.env, ctx.env.approvedSpec?.content ?? null, now)) return fail('settlement_closed');
    to = 'preparing';
  }

  let moved;
  try {
    moved = await withdrawFiling({
      claimId,
      userId: caller.user.id,
      to,
      reasonCode: move === 'withdraw' ? args.reason ?? 'changed_mind' : REASON[move],
      actor: 'user',
      now,
    });
  } catch (error) {
    logFilingError('withdrawFiling failed', { code: error instanceof Error ? error.name : null });
    return fail('service_unavailable');
  }
  if (!moved.ok) return fail(moved.code);

  // Reopened: check the packet again, so it reads ready when nothing needs changing.
  if (move === 'reopen') {
    const again = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
    if (again.ok && again.ctx.packet?.status === 'open') {
      await savePacket({
        ctx: again.ctx,
        packet: again.ctx.packet,
        content: contentOf(again.ctx.packet),
        spec: again.ctx.packetSpec,
        documents: again.ctx.documents,
        changedPaths: [],
        detail: { action: 'reopened' },
      });
    }
  }
  return viewResponse({ caller, req, claimId });
}

/** filed_by_claimmatch -> submitted with the number the administrator gave the member. */
export async function addConfirmation(args: {
  caller: FilingCaller;
  req: Request;
  claimId: string;
  confirmationNumber: string;
}): Promise<Response> {
  const { caller, req, claimId } = args;
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
  if (!loaded.ok) return fail(loaded.code);
  const { claim } = loaded.ctx;
  const number = args.confirmationNumber.trim();
  if (claim.status === 'submitted' && claim.confirmation_number?.trim() === number) return viewResponse({ caller, req, claimId });
  if (claim.status !== 'filed_by_claimmatch') return fail('invalid_transition');
  const { error } = await createServiceClient().rpc('filing_record_confirmation', {
    p_claim_id: claimId,
    p_user_id: caller.user.id,
    p_confirmation_number: number,
    p_actor: 'user',
    p_detail: { request_id: requestIdOf(req) },
  });
  if (error) {
    const code = dbErrorCode(error);
    if (code === 'service_unavailable') logFilingError('filing_record_confirmation failed', error);
    return fail(code);
  }
  return viewResponse({ caller, req, claimId });
}
