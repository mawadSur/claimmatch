import { UpdatePacketRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { updatePacket } from '@/lib/filing/v2/packet-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/filing/claims/{claimId}/packet: save answers, member details and
 * choices at the revision the client saw (409 revision_conflict otherwise).
 * 409 packet_locked once signed; 422 for values Lawsuit AI never stores.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'write', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, UpdatePacketRequestSchema);
  if (!body.ok) return body.response;
  return updatePacket({ caller: begin.caller, req, claimId, body: body.data });
}
