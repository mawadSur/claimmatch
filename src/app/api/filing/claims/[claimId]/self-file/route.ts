import { EmptyRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { moveClaim } from '@/lib/filing/v2/moves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST .../self-file {}: the member finishes this claim on the official site
 * instead. Any queued job is cancelled and the signature voided; the prepared
 * answers stay available to copy.
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'action', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, EmptyRequestSchema);
  if (!body.ok) return body.response;
  return moveClaim({ caller: begin.caller, req, claimId, move: 'self_file' });
}
