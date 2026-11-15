import { StartFilingRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, fail, parseJsonBody, reply } from '@/lib/filing/v2/http';
import { startFiling, viewResponse } from '@/lib/filing/v2/start';
import { listClaimFilingSummaries } from '@/lib/filing/v2/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/filing/claims: the member's one-click claims with their lane and
 * status, soonest deadline first (dashboard and app list). 404 while
 * ONE_CLICK_FILING_ENABLED is off.
 */
export async function GET(req: Request) {
  const begin = await beginFilingRoute(req, 'read');
  if (!begin.ok) return begin.response;
  const { supabase, user } = begin.caller;
  const list = await listClaimFilingSummaries({ supabase, userId: user.id, now: new Date() });
  if (!list.ok) return fail(list.code);
  return reply({ items: list.items });
}

/**
 * POST /api/filing/claims { lawsuit_id }: start one-click on a settlement, or
 * resume the claim the member has. 201 with a new claim, 200 otherwise. Open,
 * published, real settlements only (409 settlement_closed); a claim already
 * reported or filed is never started again (409 already_filed).
 */
export async function POST(req: Request) {
  const begin = await beginFilingRoute(req, 'write', { json: true });
  if (!begin.ok) return begin.response;
  const body = await parseJsonBody(req, StartFilingRequestSchema);
  if (!body.ok) return body.response;
  const started = await startFiling(begin.caller, body.data.lawsuit_id.toLowerCase(), req);
  if (!started.ok) return fail(started.code);
  return viewResponse({ caller: begin.caller, req, claimId: started.claimId, status: started.created ? 201 : 200 });
}
