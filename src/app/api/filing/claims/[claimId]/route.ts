import { beginFilingRoute, claimIdParam, fail } from '@/lib/filing/v2/http';
import { viewResponse } from '@/lib/filing/v2/start';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/filing/claims/{claimId}: one claim's status, lane, packet,
 * timeline and next actions, for its owner only (404 for anyone else's).
 */
export async function GET(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'read');
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  return viewResponse({ caller: begin.caller, req, claimId });
}
