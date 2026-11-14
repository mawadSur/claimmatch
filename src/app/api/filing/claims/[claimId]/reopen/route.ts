import { EmptyRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { moveClaim } from '@/lib/filing/v2/moves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST .../reopen {}: a signed or queued claim back to editing (its queued job
 * is cancelled and its signature voided); it reads ready again when nothing
 * needs changing. Never while filing is under way (409 filing_in_progress).
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'action', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, EmptyRequestSchema);
  if (!body.ok) return body.response;
  return moveClaim({ caller: begin.caller, req, claimId, move: 'reopen' });
}
