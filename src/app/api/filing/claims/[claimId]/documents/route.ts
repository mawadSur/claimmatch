import { CreateDocumentRequestSchema } from '@/lib/filing/v2/contract';
import { createDocumentSlot } from '@/lib/filing/v2/document-actions';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/filing/claims/{claimId}/documents { kind, mime, size_bytes }: an
 * upload slot for proof the claim asks for, with a signed upload URL (2 hours,
 * no overwrite). No file names. 409 document_limit, packet_locked.
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const begin = await beginFilingRoute(req, 'documents', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, CreateDocumentRequestSchema);
  if (!body.ok) return body.response;
  return createDocumentSlot({ caller: begin.caller, claimId, body: body.data });
}
