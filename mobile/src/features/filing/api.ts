/**
 * The app's calls to the member filing API (/api/filing/claims/**), the same
 * endpoints the web's src/components/filing/filing-api.ts calls, with the
 * app's bearer token through the shared API client (refresh on 401, never a
 * cookie). There are no app-only routes. Every answer is checked against the
 * shared contract's schemas.
 *
 * While ONE_CLICK_FILING_ENABLED is off every route answers 404 not_found;
 * `isFilingOff` tells the screens to keep today's self-file steps.
 */
import {
  ClaimFilingListResponseSchema,
  ClaimFilingResponseSchema,
  DocumentResponseSchema,
  DocumentSlotResponseSchema,
  DownloadResponseSchema,
  EsignConsentResponseSchema,
  FilingErrorBodySchema,
  LanePreviewResponseSchema,
  IDEMPOTENCY_HEADER,
  type ClaimFilingView,
  type DocumentMime,
  type JevIssueView,
  type SignRequest,
} from '@shared/lib/filing/v2/contract';
import * as Crypto from 'expo-crypto';
import type { z } from 'zod';

import { getApi, type ApiFailure } from '@/lib/api';

import type { PacketPatch } from './form';

export interface FilingFailure {
  ok: false;
  /** HTTP status, or 0 when there was no answer. */
  status: number;
  /** The server's FilingErrorCode, or the API client's own code ('network', 'logged_out', ...). */
  code: string | null;
  /** Text to show. */
  error: string;
  issues?: JevIssueView[];
  fields?: { path: string; message: string }[];
}

export type FilingResult<T> = { ok: true; data: T } | FilingFailure;

export type WithdrawReason = 'changed_mind' | 'filed_myself' | 'not_eligible' | 'other';

const BASE = '/api/filing/claims';

function toFailure(failed: ApiFailure): FilingFailure {
  const parsed = FilingErrorBodySchema.safeParse(failed.body);
  if (parsed.success) {
    return {
      ok: false,
      status: failed.status,
      code: parsed.data.code,
      error: failed.error,
      issues: parsed.data.issues,
      fields: parsed.data.fields,
    };
  }
  return { ok: false, status: failed.status, code: failed.code, error: failed.error };
}

/** One-click filing is off on the server (or this claim isn't the member's): show the self-file steps. */
export function isFilingOff(result: FilingFailure): boolean {
  return result.status === 404;
}

async function call<S extends z.ZodTypeAny>(
  schema: S,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<FilingResult<z.infer<S>>> {
  // Writes are JSON only (415 otherwise), so they always send a body; GET and DELETE send none.
  const write = method === 'POST' || method === 'PATCH';
  const result = await getApi().request<z.infer<S>>(`${BASE}${path}`, {
    method,
    body: write ? (body ?? {}) : undefined,
    parse: (json) => schema.parse(json) as z.infer<S>,
  });
  return result.ok ? { ok: true, data: result.data } : toFailure(result);
}

async function view(result: Promise<FilingResult<z.infer<typeof ClaimFilingResponseSchema>>>): Promise<FilingResult<ClaimFilingView>> {
  const r = await result;
  return r.ok ? { ok: true, data: r.data.filing } : r;
}

const claimPath = (claimId: string, rest = '') => `/${encodeURIComponent(claimId)}${rest}`;
const docPath = (claimId: string, documentId: string, rest = '') =>
  claimPath(claimId, `/documents/${encodeURIComponent(documentId)}${rest}`);

export function getFiling(claimId: string) {
  return view(call(ClaimFilingResponseSchema, 'GET', claimPath(claimId)));
}

/** The member's one-click claims (GET /api/filing/claims). Fail-soft at the caller. */
export function listFilingClaims() {
  return call(ClaimFilingListResponseSchema, 'GET', '');
}

/** The lane this member would get on a settlement today (writes nothing). */
export async function getLanePreview(lawsuitId: string) {
  const r = await call(LanePreviewResponseSchema, 'GET', `/preview?lawsuit_id=${encodeURIComponent(lawsuitId)}`);
  return r.ok ? { ok: true as const, data: r.data.preview } : r;
}

export function startFiling(lawsuitId: string) {
  return view(call(ClaimFilingResponseSchema, 'POST', '', { lawsuit_id: lawsuitId }));
}

export function updatePacket(claimId: string, revision: number, patch: PacketPatch) {
  return view(call(ClaimFilingResponseSchema, 'PATCH', claimPath(claimId, '/packet'), { revision, ...patch }));
}

export function createDocumentSlot(claimId: string, body: { kind: string; mime: DocumentMime; size_bytes: number }) {
  return call(DocumentSlotResponseSchema, 'POST', claimPath(claimId, '/documents'), body);
}

export function completeDocument(claimId: string, documentId: string) {
  return call(DocumentResponseSchema, 'POST', docPath(claimId, documentId, '/complete'), {});
}

export function deleteDocument(claimId: string, documentId: string) {
  return call(DocumentResponseSchema, 'DELETE', docPath(claimId, documentId));
}

export function documentDownload(claimId: string, documentId: string) {
  return call(DownloadResponseSchema, 'GET', docPath(claimId, documentId));
}

export function giveEsignConsent(claimId: string, textVersion: string) {
  return call(EsignConsentResponseSchema, 'POST', claimPath(claimId, '/esign-consent'), {
    accepted: true,
    text_version: textVersion,
  });
}

/**
 * The one click. Reuse the same key when retrying the same attempt: the
 * server returns the first signature. The key travels as a header (the API
 * client's `headers` option).
 */
export async function signPacket(claimId: string, body: SignRequest, idempotencyKey: string): Promise<FilingResult<ClaimFilingView>> {
  const result = await getApi().request(`${BASE}${claimPath(claimId, '/sign')}`, {
    method: 'POST',
    body,
    headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    parse: (json) => ClaimFilingResponseSchema.parse(json),
  });
  return result.ok ? { ok: true, data: result.data.filing } : toFailure(result);
}

export function reopenFiling(claimId: string) {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/reopen'), {}));
}

export function moveToSelfFile(claimId: string) {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/self-file'), {}));
}

export function withdrawClaim(claimId: string, reason: WithdrawReason) {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/withdraw'), { reason }));
}

export function addConfirmationNumber(claimId: string, confirmationNumber: string) {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/confirmation'), { confirmation_number: confirmationNumber }));
}

/** A fresh Idempotency-Key (UUID v4). */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export type UploadOutcome = { ok: true } | { ok: false; status: number };

/** Reads a picked file (file:// or content:// URI) into a Blob; null when it can't be read. */
export async function readPickedFile(uri: string): Promise<Blob | null> {
  try {
    const res = await fetch(uri);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Puts the file's bytes at the server-issued signed upload URL (Supabase
 * Storage, upsert off), reporting progress. Straight to Storage, never
 * through the API client: no bearer token and no file name are sent.
 */
export function uploadToSignedUrl(
  url: string,
  file: Blob,
  mime: DocumentMime,
  onProgress: (percent: number) => void,
): Promise<UploadOutcome> {
  if (!/^https:\/\//i.test(url)) return Promise.resolve({ ok: false, status: 0 });
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.onabort = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
}
