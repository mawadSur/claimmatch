import { readStoredFile, sha256Text } from '@/lib/filing/channels/context';
import { CLAIM_DOCUMENTS_BUCKET, DOWNLOAD_URL_TTL_SECONDS } from '@/lib/filing/v2/contract';
import { canViewMemberFilingData } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { audited, fail, guard, reply, routeId } from '../../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/filing/documents/{documentId}/download (filing_agent or
 * legal_reviewer): a 5-minute link to a stored file of a claim that has a
 * filing job. The bytes are re-hashed first: a file that differs from its
 * recorded SHA-256 is never shown. Logged (view_document) before the link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const auth = await guard(req, canViewMemberFilingData);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'documentId');
  if (!id.ok) return id.res;
  const svc = createServiceClient();
  const { data: doc } = await svc
    .from('claim_documents')
    .select('id, claim_id, user_id, status, sha256, storage_path, source')
    .eq('id', id.id)
    .maybeSingle();
  if (!doc || doc.status !== 'stored' || typeof doc.sha256 !== 'string') return fail('not_found');
  const { data: job } = await svc.from('claim_filing_jobs').select('id, lawsuit_id').eq('claim_id', doc.claim_id).limit(1).maybeSingle();
  if (!job) return fail('not_found');
  let bytes: Uint8Array;
  try {
    bytes = await readStoredFile(svc, String(doc.storage_path));
  } catch {
    return fail('service_unavailable');
  }
  if (sha256Text(bytes) !== doc.sha256) {
    console.error('[admin/filing] stored file differs from its hash', { document: doc.id });
    return fail('document_invalid');
  }
  const blocked = await audited({
    staff: auth.staff,
    action: 'view_document',
    subjectUserId: String(doc.user_id),
    claimId: String(doc.claim_id),
    jobId: String(job.id),
    lawsuitId: String(job.lawsuit_id),
    targetTable: 'claim_documents',
    targetId: id.id,
    detail: { source: doc.source },
    req,
  });
  if (blocked) return blocked;
  const { data: link, error } = await svc.storage.from(CLAIM_DOCUMENTS_BUCKET).createSignedUrl(String(doc.storage_path), DOWNLOAD_URL_TTL_SECONDS);
  if (error || !link?.signedUrl) return fail('service_unavailable');
  return reply({ url: link.signedUrl, expires_at: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString() });
}
