import { ConfirmationRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { addConfirmation } from '@/lib/filing/v2/moves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST .../confirmation { confirmation_number }: the administrator's number,
 * as the member got it, for a claim Lawsuit AI filed (filed_by_claimmatch ->
 * submitted).
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'action', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, ConfirmationRequestSchema);
  if (!body.ok) return body.response;
  return addConfirmation({ caller: begin.caller, req, claimId, confirmationNumber: body.data.confirmation_number });
}
