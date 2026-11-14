/**
 * PATCH /api/filing/claims/{claimId}/packet: the member saves answers,
 * member details, choices and consents. Checked at the boundary
 * (packet-update.ts), then by Jev (partial, or pre_sign once complete on an
 * agent lane); never-store values are refused before anything is written.
 * Saving member details back to the profile needs the member's consent
 * (save_member_to_profile), written with their own client. Server only.
 */
import { loadClaimContext } from './claim-context';
import type { UpdatePacketRequest } from './contract';
import { removeMemberDocuments } from './documents-store';
import { openForClaimsNow } from './environment';
import { fail, logFilingError, requestIdOf, type FilingCaller } from './http';
import { applyPacketUpdate } from './packet-update';
import { commitPacketSave, preparePacketSave, type SaveInput } from './persist';
import { viewResponse } from './start';

const EDITABLE = new Set(['preparing', 'ready', 'needs_you', 'self_file']);

export async function updatePacket(args: {
  caller: FilingCaller;
  req: Request;
  claimId: string;
  body: UpdatePacketRequest;
}): Promise<Response> {
  const { caller, req, claimId, body } = args;
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const packet = ctx.packet;
  if (ctx.claim.status === 'filing') return fail('filing_in_progress');
  if (!packet) return fail('invalid_transition');
  if (packet.status !== 'open') return fail('packet_locked');
  if (!EDITABLE.has(ctx.claim.status)) return fail('invalid_transition');
  if (!openForClaimsNow(ctx.env, ctx.env.approvedSpec?.content ?? null, ctx.now)) return fail('settlement_closed');
  if (body.revision !== packet.revision) return fail('revision_conflict');

  const update = applyPacketUpdate(ctx, packet, body);
  if (!update.ok) return fail(update.code, { fields: update.fields });
  const removed = new Set(update.removeDocuments.map((d) => d.id));
  const input: SaveInput = {
    ctx,
    packet,
    content: update.content,
    spec: update.spec,
    documents: ctx.documents.filter((d) => !removed.has(d.id)),
    changedPaths: update.changedPaths,
    detail: { request_id: requestIdOf(req) },
  };
  const prepared = preparePacketSave(input);
  if (!prepared.ok) return fail(prepared.code, { issues: prepared.issues });
  if (!(await removeMemberDocuments(update.removeDocuments, 'member_removed', ctx.now))) return fail('service_unavailable');
  const saved = await commitPacketSave(input, prepared);
  if (!saved.ok) return fail(saved.code, { issues: saved.issues });

  if (update.profilePatch) {
    // The member's own client: RLS and the column grants keep it to their profile and these columns.
    const { error } = await caller.supabase.from('profiles').update(update.profilePatch).eq('id', caller.user.id);
    if (error) logFilingError('profile save from packet failed', error);
  }
  return viewResponse({ caller, req, claimId });
}
