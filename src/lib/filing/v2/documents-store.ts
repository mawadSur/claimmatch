/**
 * Member uploads in the private claim-documents bucket (service role, after
 * the route checked the member owns the claim and the packet is open):
 * upload slots with signed upload URLs (upsert off), completing an upload
 * (the server reads the object and records its real type, size and SHA-256),
 * and removal. Server only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import {
  CLAIM_DOCUMENTS_BUCKET,
  DOCUMENT_MAX_BYTES,
  UPLOAD_URL_TTL_SECONDS,
  type FilingErrorCode,
} from './contract';
import type { DocumentMime } from './contract-spec';
import { DOCUMENT_COLUMNS, memberDocumentPath, mimeMatches, sniffDocumentMime, toDocumentRecord, type DocumentRecord } from './documents';
import { dbErrorCode, logFilingError } from './http';

type Failure = { ok: false; code: FilingErrorCode };

/** Removes the objects, then marks the rows deleted. false when any step failed (nothing is retried here). */
export async function removeMemberDocuments(
  docs: DocumentRecord[],
  reason: 'member_removed' | 'upload_expired',
  now: Date,
): Promise<boolean> {
  if (docs.length === 0) return true;
  const db = createServiceClient();
  const { error: storageError } = await db.storage.from(CLAIM_DOCUMENTS_BUCKET).remove(docs.map((d) => d.storage_path));
  if (storageError) {
    logFilingError('document object removal failed', { code: (storageError as { name?: string }).name ?? null });
    return false;
  }
  for (const doc of docs) {
    const { error } = await db
      .from('claim_documents')
      .update({ status: 'deleted', deleted_at: now.toISOString(), delete_reason: reason })
      .eq('id', doc.id)
      .eq('status', doc.status);
    if (error) {
      logFilingError('document delete failed', error);
      return false;
    }
  }
  return true;
}

/** A pending_upload row at the server's chosen path, and a signed upload URL for it (valid 2 hours, no upsert). */
export async function createUploadSlot(args: {
  userId: string;
  claimId: string;
  packetId: string;
  kind: string;
  mime: DocumentMime;
  sizeBytes: number;
  healthFlag: boolean;
  now: Date;
}): Promise<{ ok: true; doc: DocumentRecord; upload: { signed_url: string; token: string; path: string; expires_at: string } } | Failure> {
  const db = createServiceClient();
  const id = randomUUID();
  const path = memberDocumentPath(args.userId, args.claimId, id, args.mime);
  const expiresAt = new Date(args.now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();
  const inserted = await db
    .from('claim_documents')
    .insert({
      id,
      claim_id: args.claimId,
      user_id: args.userId,
      packet_id: args.packetId,
      source: 'member',
      kind: args.kind,
      storage_path: path,
      mime: args.mime,
      size_bytes: args.sizeBytes,
      status: 'pending_upload',
      health_flag: args.healthFlag,
      uploaded_by: args.userId,
      upload_expires_at: expiresAt,
    })
    .select(DOCUMENT_COLUMNS)
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    const code = dbErrorCode(inserted.error);
    if (code === 'service_unavailable') logFilingError('upload slot insert failed', inserted.error);
    return { ok: false, code: code === 'packet_locked' ? 'packet_locked' : code };
  }
  const signed = await db.storage.from(CLAIM_DOCUMENTS_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data) {
    logFilingError('signed upload url failed', { code: (signed.error as { name?: string } | null)?.name ?? null });
    await db.from('claim_documents').delete().eq('id', id).eq('status', 'pending_upload');
    return { ok: false, code: 'service_unavailable' };
  }
  return {
    ok: true,
    doc: toDocumentRecord(inserted.data as Record<string, unknown>),
    upload: { signed_url: signed.data.signedUrl, token: signed.data.token, path, expires_at: expiresAt },
  };
}

async function readObject(path: string): Promise<Uint8Array | null | 'error'> {
  const { data, error } = await createServiceClient().storage.from(CLAIM_DOCUMENTS_BUCKET).download(path);
  if (error) {
    const status = Number((error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode);
    if (status === 400 || status === 404) return null;
    logFilingError('document read failed', { code: (error as { name?: string }).name ?? null });
    return 'error';
  }
  if (!data) return null;
  return new Uint8Array(await (data as Blob).arrayBuffer());
}

/**
 * Completes an upload: reads the object the member put at the slot's path,
 * checks its size and real type against the slot (and the proof item), and
 * records size and SHA-256; a file that fails is marked rejected and removed.
 */
export async function completeUpload(args: {
  doc: DocumentRecord;
  acceptedMime: readonly string[];
  now: Date;
}): Promise<{ ok: true; doc: DocumentRecord } | Failure> {
  const { doc } = args;
  const bytes = await readObject(doc.storage_path);
  if (bytes === 'error') return { ok: false, code: 'service_unavailable' };
  if (bytes === null || bytes.length === 0) return { ok: false, code: 'upload_incomplete' };
  const db = createServiceClient();
  const actual = sniffDocumentMime(bytes);
  const fits = bytes.length <= DOCUMENT_MAX_BYTES && mimeMatches(doc.mime, actual) && args.acceptedMime.includes(doc.mime);
  if (!fits) {
    await db.storage.from(CLAIM_DOCUMENTS_BUCKET).remove([doc.storage_path]);
    const { error } = await db.from('claim_documents').update({ status: 'rejected' }).eq('id', doc.id).eq('status', 'pending_upload');
    if (error) logFilingError('document reject failed', error);
    return { ok: false, code: 'document_invalid' };
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { data, error } = await db
    .from('claim_documents')
    .update({ status: 'stored', sha256, size_bytes: bytes.length, stored_at: args.now.toISOString() })
    .eq('id', doc.id)
    .eq('status', 'pending_upload')
    .select(DOCUMENT_COLUMNS)
    .maybeSingle();
  if (error) {
    const code = dbErrorCode(error);
    if (code === 'service_unavailable') logFilingError('document store failed', error);
    return { ok: false, code };
  }
  if (!data) return { ok: false, code: 'upload_incomplete' };
  return { ok: true, doc: toDocumentRecord(data as Record<string, unknown>) };
}
