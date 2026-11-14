/**
 * Browser calls to the member filing API (/api/filing/claims/**, B2), the
 * same endpoints the app uses with its bearer token. The web sends its
 * session cookie. Every answer is checked against the contract's schemas, and
 * every failure comes back as a FilingErrorBody the screens can place.
 */
import type { z } from 'zod';
import {
  ClaimFilingResponseSchema,
  DocumentResponseSchema,
  DocumentSlotResponseSchema,
  DownloadResponseSchema,
  EsignConsentResponseSchema,
  FILING_ERROR_MESSAGES,
  FilingErrorBodySchema,
  IDEMPOTENCY_HEADER,
  type ClaimFilingView,
  type DocumentMime,
  type FilingErrorBody,
  type FilingErrorCode,
  type SignRequest,
  type UpdatePacketRequest,
} from '@/lib/filing/v2/contract';
import { ONE_CLICK_COPY } from '@/lib/copy';

export type FilingResult<T> = { ok: true; data: T } | { ok: false; status: number; error: FilingErrorBody };

const BASE = '/api/filing/claims';

function failure(status: number, code: FilingErrorCode, message?: string): { ok: false; status: number; error: FilingErrorBody } {
  return { ok: false, status, error: { error: message ?? FILING_ERROR_MESSAGES[code], code } };
}

/** When the server's error body is unreadable (a proxy page, a crash), say something true. */
function codeForStatus(status: number): FilingErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'service_unavailable';
}

async function call<S extends z.ZodTypeAny>(
  schema: S,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<FilingResult<z.infer<S>>> {
  let res: Response;
  try {
    // Writes are JSON only (415 otherwise), so they always send a body.
    const write = method !== 'GET';
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(write ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: write ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    return failure(0, 'service_unavailable', ONE_CLICK_COPY.network);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = FilingErrorBodySchema.safeParse(json);
    return parsed.success ? { ok: false, status: res.status, error: parsed.data } : failure(res.status, codeForStatus(res.status));
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return failure(res.status, 'service_unavailable');
  return { ok: true, data: parsed.data };
}

const claimPath = (claimId: string, rest = '') => `/${encodeURIComponent(claimId)}${rest}`;

async function view(result: Promise<FilingResult<z.infer<typeof ClaimFilingResponseSchema>>>): Promise<FilingResult<ClaimFilingView>> {
  const r = await result;
  return r.ok ? { ok: true, data: r.data.filing } : r;
}

export function getFiling(claimId: string): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'GET', claimPath(claimId)));
}

/** Starts (or resumes) one-click filing on a settlement. */
export function startFiling(lawsuitId: string): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'POST', '', { lawsuit_id: lawsuitId }));
}

export function updatePacket(claimId: string, body: UpdatePacketRequest): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'PATCH', claimPath(claimId, '/packet'), body));
}

export function createDocumentSlot(
  claimId: string,
  body: { kind: string; mime: DocumentMime; size_bytes: number },
): Promise<FilingResult<z.infer<typeof DocumentSlotResponseSchema>>> {
  return call(DocumentSlotResponseSchema, 'POST', claimPath(claimId, '/documents'), body);
}

export function completeDocument(claimId: string, documentId: string) {
  return call(DocumentResponseSchema, 'POST', claimPath(claimId, `/documents/${encodeURIComponent(documentId)}/complete`), {});
}

export function deleteDocument(claimId: string, documentId: string) {
  return call(DocumentResponseSchema, 'DELETE', claimPath(claimId, `/documents/${encodeURIComponent(documentId)}`));
}

export function documentDownload(claimId: string, documentId: string) {
  return call(DownloadResponseSchema, 'GET', claimPath(claimId, `/documents/${encodeURIComponent(documentId)}`));
}

export function giveEsignConsent(claimId: string, textVersion: string) {
  return call(EsignConsentResponseSchema, 'POST', claimPath(claimId, '/esign-consent'), {
    accepted: true,
    text_version: textVersion,
  });
}

/** The one click. Reuse the same key when retrying the same attempt: the server returns the first signature. */
export function signPacket(claimId: string, body: SignRequest, idempotencyKey: string): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/sign'), body, { [IDEMPOTENCY_HEADER]: idempotencyKey }));
}

export function reopenFiling(claimId: string): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/reopen'), {}));
}

export function moveToSelfFile(claimId: string): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/self-file'), {}));
}

export type WithdrawReason = 'changed_mind' | 'filed_myself' | 'not_eligible' | 'other';

export function withdrawClaim(claimId: string, reason: WithdrawReason): Promise<FilingResult<ClaimFilingView>> {
  return view(call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/withdraw'), { reason }));
}

export function addConfirmationNumber(claimId: string, confirmationNumber: string): Promise<FilingResult<ClaimFilingView>> {
  return view(
    call(ClaimFilingResponseSchema, 'POST', claimPath(claimId, '/confirmation'), { confirmation_number: confirmationNumber }),
  );
}

/** A fresh Idempotency-Key (UUID v4). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type UploadOutcome = { ok: true } | { ok: false; status: number };

/**
 * Puts the file's bytes at the server-issued signed upload URL (Supabase
 * Storage, upsert off), reporting progress. The bytes go straight to Storage;
 * no file name is ever sent.
 */
export function uploadToSignedUrl(
  url: string,
  file: Blob,
  mime: DocumentMime,
  onProgress: (percent: number) => void,
): Promise<UploadOutcome> {
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
