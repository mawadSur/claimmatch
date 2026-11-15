import { EmptyRequestSchema } from '@/lib/filing/v2/contract';
import { completeDocument } from '@/lib/filing/v2/document-actions';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody, UUID_RE } from '@/lib/filing/v2/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST .../documents/{documentId}/complete {}: the server reads the uploaded
 * object, checks its size and real type, computes its SHA-256 and stores it
 * (409 upload_incomplete when nothing was uploaded; 422 document_invalid when
 * the file is not an accepted type, which removes it).
 */
export async function POST(req: Request, { params }: { params: Promise<{ claimId: string; documentId: string }> }) {
  const begin = await beginFilingRoute(req, 'documents', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  const { documentId } = await params;
  if (!claimId || !UUID_RE.test(documentId)) return fail('not_found');
  const body = await parseJsonBody(req, EmptyRequestSchema);
  if (!body.ok) return body.response;
  return completeDocument({ caller: begin.caller, claimId, documentId: documentId.toLowerCase() });
}
