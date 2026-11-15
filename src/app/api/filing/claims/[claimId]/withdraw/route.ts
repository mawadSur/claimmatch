import { WithdrawRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { moveClaim } from '@/lib/filing/v2/moves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST .../withdraw { reason? }: the member stops this claim before filing
 * starts (any queued job cancelled, signature voided, packet closed). Never
 * while filing is under way (409 filing_in_progress).
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'action', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, WithdrawRequestSchema);
  if (!body.ok) return body.response;
  return moveClaim({ caller: begin.caller, req, claimId, move: 'withdraw', reason: body.data.reason });
}
