import { IDEMPOTENCY_HEADER, IdempotencyKeySchema, SignRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';
import { signClaim } from '@/lib/filing/v2/sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/filing/claims/{claimId}/sign with an Idempotency-Key (UUID): the
 * one click. The member reviewed the packet and the sworn statement, ticked
 * it themselves and typed their full legal name; Lawsuit AI stores the
 * e-signature for this exact packet and queues the filing. A retry with the
 * same key returns the first signature. Order of checks: docs section 5.
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'sign', { json: true });
  if (!begin.ok) return begin.response;
  const key = IdempotencyKeySchema.safeParse(req.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? '');
  if (!key.success) return fail('idempotency_key_required');
  const body = await parseJsonBody(req, SignRequestSchema);
  if (!body.ok) return body.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  return signClaim({ caller: begin.caller, req, claimId, key: key.data.toLowerCase(), body: body.data });
}
