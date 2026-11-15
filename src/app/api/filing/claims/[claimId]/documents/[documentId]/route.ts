import { deleteDocument, documentDownload } from '@/lib/filing/v2/document-actions';
import { beginFilingRoute, claimIdParam, fail, UUID_RE } from '@/lib/filing/v2/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ claimId: string; documentId: string }> };

async function ids(params: Params['params']): Promise<{ claimId: string; documentId: string } | null> {
  const { documentId } = await params;
  const claimId = await claimIdParam(params);
  return claimId && UUID_RE.test(documentId) ? { claimId, documentId: documentId.toLowerCase() } : null;
}

/** GET .../documents/{documentId}: a 5-minute signed link to the member's own stored file. */
export async function GET(req: Request, { params }: Params) {
  const begin = await beginFilingRoute(req, 'documents');
  if (!begin.ok) return begin.response;
  const target = await ids(params);
  if (!target) return fail('not_found');
  return documentDownload({ caller: begin.caller, ...target });
}

/** DELETE .../documents/{documentId}: removes an upload while the packet is open (before signing). */
export async function DELETE(req: Request, { params }: Params) {
  const begin = await beginFilingRoute(req, 'documents');
  if (!begin.ok) return begin.response;
  const target = await ids(params);
  if (!target) return fail('not_found');
  return deleteDocument({ caller: begin.caller, ...target });
}
