/**
 * POST /api/filing/claims/{claimId}/sign, the one click (design section 5).
 * After the route's flag, sign-in, rate limit, JSON, Idempotency-Key and body
 * checks: the claim is the member's and ready; the lane is still an agent
 * lane; a real sign-in within 15 minutes; E-SIGN consent of the current
 * version; revision, hash, spec id and version match; the authorization text
 * version is the server's; the typed name matches the packet's legal name;
 * Jev pre_sign has no block (its run is stored first). Then
 * filing_sign_packet stores the signature and enqueueFiling queues it. A
 * retry with the same key returns the first signature. Server only.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { requestIpForRecord } from '@/lib/staff-roles';
import { enqueueFiling } from './jobs';
import { agentAuthorizationText, AGENT_AUTHORIZATION_VERSION } from './authorization-text';
import { currentPacketState, loadClaimContext, type ClaimContext } from './claim-context';
import { isAgentLane, normalizeTypedName, type SignRequest } from './contract';
import { openForClaimsNow } from './environment';
import { readFreshSignIn } from './fresh-sign-in';
import { dbErrorCode, fail, logFilingError, requestIdOf, requestUserAgent, type FilingCaller } from './http';
import { canonicalJson } from './packet';
import { memberIssues, recordJevRun, runJevFor, storedJev } from './persist';
import { viewResponse } from './start';
import { ESIGN_TEXT_VERSION } from './esign';
import type { CanonicalJsonValue } from './contract';
import type { LaneDecision } from '../channels/index';

type Prior = { kind: 'none' } | { kind: 'replay' } | { kind: 'conflict' } | { kind: 'error' };

async function priorSignature(caller: FilingCaller, claimId: string, key: string, packetHash: string): Promise<Prior> {
  const { data, error } = await caller.supabase
    .from('claim_signatures')
    .select('id, claim_id, packet_hash')
    .eq('user_id', caller.user.id)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) {
    logFilingError('signature lookup failed', error);
    return { kind: 'error' };
  }
  if (!data) return { kind: 'none' };
  const row = data as { claim_id?: unknown; packet_hash?: unknown };
  return row.claim_id === claimId && row.packet_hash === packetHash ? { kind: 'replay' } : { kind: 'conflict' };
}

/** Queues a signed claim on the lane it was signed for. A failure leaves it signed: the cron queues it. */
async function queue(signatureId: string, decision: LaneDecision, now: Date): Promise<void> {
  try {
    const queued = await enqueueFiling({ signatureId, decision, actor: 'user', now });
    if (!queued.ok) logFilingError('enqueue after signing failed', { code: queued.code });
  } catch (error) {
    logFilingError('enqueue after signing failed', { code: error instanceof Error ? error.name : null });
  }
}

/** A retry of a signing that already happened: queue it if that step failed, then show the claim. */
async function replay(caller: FilingCaller, req: Request, claimId: string): Promise<Response> {
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
  if (loaded.ok) await queueIfSigned(loaded.ctx);
  return viewResponse({ caller, req, claimId });
}

async function queueIfSigned(ctx: ClaimContext): Promise<void> {
  if (ctx.claim.status !== 'signed' || !ctx.signature) return;
  const state = currentPacketState(ctx);
  if (state && state.lane.decision.lane === ctx.signature.lane) await queue(ctx.signature.id, state.lane.decision, ctx.now);
}

export async function signClaim(args: { caller: FilingCaller; req: Request; claimId: string; key: string; body: SignRequest }): Promise<Response> {
  const { caller, req, claimId, key, body } = args;
  const now = new Date();
  const prior = await priorSignature(caller, claimId, key, body.packet_hash);
  if (prior.kind === 'error') return fail('service_unavailable');
  if (prior.kind === 'conflict') return fail('idempotency_conflict');
  if (prior.kind === 'replay') return replay(caller, req, claimId);

  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now });
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const packet = ctx.packet;
  if (!openForClaimsNow(ctx.env, ctx.env.approvedSpec?.content ?? null, now)) return fail('settlement_closed');
  if (ctx.claim.status !== 'ready') {
    // A concurrent request with this key may have just signed it.
    const again = await priorSignature(caller, claimId, key, body.packet_hash);
    if (again.kind === 'replay') return replay(caller, req, claimId);
    return fail(ctx.claim.status === 'filing' ? 'filing_in_progress' : 'invalid_transition');
  }
  if (!packet || packet.status !== 'open') return fail('packet_locked');
  const state = currentPacketState(ctx);
  if (!state || !state.lane.view.agent || !isAgentLane(state.lane.decision.lane)) return fail('lane_unavailable');
  const lane = state.lane.decision.lane;

  const fresh = await readFreshSignIn({ supabase: caller.supabase, req, via: caller.via, userId: caller.user.id, now });
  if (!fresh.fresh) return fail(fresh.reason === 'unavailable' ? 'auth_unavailable' : 'reauth_required');
  const consent = ctx.consents.find((c) => c.text_version === ESIGN_TEXT_VERSION && c.withdrawn_at === null);
  if (!consent) return fail('esign_consent_required');

  const spec = state.spec;
  const approved = ctx.env.approvedSpec;
  if (
    body.revision !== packet.revision ||
    body.spec_id !== packet.spec_id ||
    body.spec_version !== packet.spec_version ||
    !spec ||
    !approved ||
    approved.id !== spec.id ||
    !state.canonical ||
    !state.hash ||
    state.hash !== body.packet_hash
  ) {
    return fail('packet_changed');
  }
  if (body.authorization_text_version !== AGENT_AUTHORIZATION_VERSION) return fail('packet_changed');
  if (normalizeTypedName(body.typed_name) !== normalizeTypedName(state.canonical.member.legal_name)) {
    return fail('typed_name_mismatch');
  }

  const result = runJevFor(ctx, state, 'pre_sign');
  if (!result) return fail('service_unavailable');
  const runId = await recordJevRun({ ctx, packetId: packet.id, state, result, trigger: 'member_sign' });
  if (!runId) return fail('service_unavailable');
  if (result.outcome === 'block') return fail('jev_blocked', { issues: memberIssues(result) });

  const db = createServiceClient();
  // Keep the stored hash equal to what the member reviewed (a profile change may have moved it), at this revision only.
  const synced = await db
    .from('claim_packets')
    .update({ packet_hash: state.hash, jev_outcome: result.outcome, jev_result: storedJev(result), jev_checked_at: now.toISOString() })
    .eq('id', packet.id)
    .eq('revision', packet.revision)
    .eq('status', 'open')
    .select('id');
  if (synced.error) return fail(dbErrorCode(synced.error));
  if (!Array.isArray(synced.data) || synced.data.length === 0) return fail('revision_conflict');

  const { data, error } = await db.rpc('filing_sign_packet', {
    p_claim_id: claimId,
    p_user_id: caller.user.id,
    p_packet_id: packet.id,
    p_packet_hash: state.hash,
    p_packet_canonical: canonicalJson(state.canonical as unknown as CanonicalJsonValue),
    p_spec_id: spec.id,
    p_statement_text: spec.content.attestation.text,
    p_authorization_text_version: AGENT_AUTHORIZATION_VERSION,
    p_authorization_text: agentAuthorizationText(lane),
    p_typed_name: body.typed_name.trim(),
    p_lane: lane,
    p_esign_consent_id: consent.id,
    p_auth_method: fresh.method,
    p_auth_time: fresh.time.toISOString(),
    p_session_id: fresh.sessionId,
    p_ip: requestIpForRecord(req),
    p_user_agent: requestUserAgent(req),
    p_idempotency_key: key,
    p_jev_run_id: runId,
    p_detail: { request_id: requestIdOf(req) },
  });
  if (error) {
    if (error.code === '23505') return fail('idempotency_conflict');
    const code = dbErrorCode(error);
    if (code === 'service_unavailable') logFilingError('filing_sign_packet failed', error);
    return fail(code);
  }
  const signed = data as { signature?: { id?: unknown; lane?: unknown } } | null;
  if (typeof signed?.signature?.id === 'string' && signed.signature.lane === lane) {
    await queue(signed.signature.id, state.lane.decision, now);
  }
  return viewResponse({ caller, req, claimId });
}
