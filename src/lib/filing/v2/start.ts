/**
 * POST /api/filing/claims: start or resume one-click on a settlement, and the
 * shared "answer with the claim's view" step of every claim route. A new
 * claim starts as preparing on an agent lane (claim_start_tracking with
 * 'preparing') or self_file otherwise, with its packet on the approved spec.
 * A self_file claim moves to the agent lane once the settlement has one
 * (self_file -> preparing; the packet then moves to the approved spec).
 * Claims already reported or filed are never started again. Server only.
 */
import { serviceRoleConfigured } from '@/lib/claims-server';
import { createServiceClient } from '@/lib/supabase/server';
import { contentOf, loadClaimContext, PROFILE_COLUMNS, settlementLane, toProfileRecord, derivePacketState } from './claim-context';
import type { FilingErrorCode } from './contract';
import { loadSettlementEnvs, openForClaimsNow } from './environment';
import { fail, logFilingError, reply, requestIdOf, type FilingCaller } from './http';
import { applyPacketUpdate } from './packet-update';
import { createPacket, savePacket } from './persist';
import { readFreshSignIn } from './fresh-sign-in';
import { removeMemberDocuments } from './documents-store';
import { toClaimRecord } from './records';
import { startableStatus } from './view-model';
import { loadClaimFilingView } from './view';

/** Answers with the claim's ClaimFilingView ({ filing }), read fresh after any write. */
export async function viewResponse(args: { caller: FilingCaller; req: Request; claimId: string; status?: number }): Promise<Response> {
  const now = new Date();
  const { supabase, user, via } = args.caller;
  const fresh = await readFreshSignIn({ supabase, req: args.req, via, userId: user.id, now });
  const loaded = await loadClaimFilingView({ supabase, userId: user.id, claimId: args.claimId, now, freshSignIn: fresh.fresh });
  if (!loaded.ok) return fail(loaded.code);
  return reply({ filing: loaded.view }, args.status ?? 200);
}

type Started = { ok: true; claimId: string; created: boolean } | { ok: false; code: FilingErrorCode };

const PACKET_STATUSES_OK = new Set(['self_file', 'preparing', 'ready', 'needs_you']);

export async function startFiling(caller: FilingCaller, lawsuitId: string, req: Request): Promise<Started> {
  const { supabase, user } = caller;
  const now = new Date();
  if (!serviceRoleConfigured()) return { ok: false, code: 'service_unavailable' };
  const [existing, profileRead] = await Promise.all([
    supabase.from('claims').select('*').eq('user_id', user.id).eq('lawsuit_id', lawsuitId).maybeSingle(),
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle(),
  ]);
  if (existing.error || profileRead.error) {
    logFilingError('start read failed', existing.error ?? profileRead.error);
    return { ok: false, code: 'service_unavailable' };
  }
  let claim = existing.data ? toClaimRecord(existing.data as Record<string, unknown>) : null;
  const startable = startableStatus(claim);
  if (startable === 'already_filed') return { ok: false, code: 'already_filed' };
  if (startable === 'blocked') return { ok: false, code: 'invalid_transition' };

  const envs = await loadSettlementEnvs([lawsuitId], now);
  if (!envs.ok) return { ok: false, code: 'settlement_unavailable' };
  const env = envs.envs.get(lawsuitId);
  if (!env || !env.context.published || env.context.fictional) return { ok: false, code: 'not_found' };
  const open = openForClaimsNow(env, env.approvedSpec?.content ?? null, now);

  let created = false;
  if (!claim) {
    if (!open) return { ok: false, code: 'settlement_closed' };
    const lane = settlementLane({ env, laneEnv: envs.lane, profile: toProfileRecord(profileRead.data as Record<string, unknown> | null), now });
    const { data, error } = await createServiceClient().rpc('claim_start_tracking', {
      p_user_id: user.id,
      p_lawsuit_id: env.settlement.id,
      p_lawsuit_title: env.settlement.title,
      p_status: lane.view.agent ? 'preparing' : 'self_file',
      p_actor: 'user',
      p_detail: { action: 'start_one_click', lane: lane.view.lane, request_id: requestIdOf(req) },
    });
    const result = data as { created?: boolean; claim?: Record<string, unknown> } | null;
    if (error || !result?.claim) {
      logFilingError('start tracking failed', error);
      return { ok: false, code: 'service_unavailable' };
    }
    claim = toClaimRecord(result.claim);
    created = Boolean(result.created);
  }
  if (!open || !PACKET_STATUSES_OK.has(claim.status)) return { ok: true, claimId: claim.id, created };

  let loaded = await loadClaimContext({ supabase, userId: user.id, claimId: claim.id, now });
  if (!loaded.ok) return loaded;
  if (!loaded.ctx.packet) {
    const made = await createPacket(loaded.ctx);
    if (!made.ok) return made;
    loaded = await loadClaimContext({ supabase, userId: user.id, claimId: claim.id, now });
    if (!loaded.ok) return loaded;
  }
  const ctx = loaded.ctx;
  const packet = ctx.packet;
  if (ctx.claim.status !== 'self_file' || !packet || packet.status !== 'open') return { ok: true, claimId: claim.id, created };

  // A self-file claim whose settlement now has an agent lane for this member.
  const state = derivePacketState(ctx, contentOf(packet), env.approvedSpec ?? ctx.packetSpec, ctx.documents);
  if (!state.lane.view.agent) return { ok: true, claimId: claim.id, created };
  const moved = await createServiceClient().rpc('claim_apply_change', {
    p_claim_id: claim.id,
    p_user_id: user.id,
    p_expected_status: 'self_file',
    p_changes: { status: 'preparing' },
    p_actor: 'user',
    p_detail: { action: 'start_one_click', lane: state.lane.view.lane, request_id: requestIdOf(req) },
  });
  if (moved.error) {
    // 40001: changed meanwhile; CM001: the trigger refused (for example a closed packet). Show what is there.
    if (moved.error.code !== '40001' && moved.error.code !== 'CM001') logFilingError('start move failed', moved.error);
    return { ok: true, claimId: claim.id, created };
  }
  const again = await loadClaimContext({ supabase, userId: user.id, claimId: claim.id, now });
  if (!again.ok || !again.ctx.packet) return { ok: true, claimId: claim.id, created };
  const update = applyPacketUpdate(again.ctx, again.ctx.packet, { revision: again.ctx.packet.revision });
  if (update.ok) {
    if (await removeMemberDocuments(update.removeDocuments, 'member_removed', now)) {
      const removed = new Set(update.removeDocuments.map((d) => d.id));
      await savePacket({
        ctx: again.ctx,
        packet: again.ctx.packet,
        content: update.content,
        spec: update.spec,
        documents: again.ctx.documents.filter((d) => !removed.has(d.id)),
        changedPaths: [],
        detail: { action: 'start_one_click' },
      });
    }
  }
  return { ok: true, claimId: claim.id, created };
}
