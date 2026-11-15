/**
 * Browser client for the staff filing API (/api/admin/filing/**, the web
 * cookie session). Responses are parsed with the contract's zod schemas
 * (src/lib/filing/v2/contract-staff.ts): an answer that does not match is an
 * error, never guessed at. Nothing here caches member data.
 */
import { z } from 'zod';
import {
  FILING_ERROR_CODES,
  FILING_ERROR_MESSAGES,
  UuidSchema,
  type AgentChannel,
  type FilingErrorCode,
  type JobStatus,
} from '@/lib/filing/v2/contract';
import {
  EvidenceUploadRequestSchema,
  JobListResponseSchema,
  type BulkExportRequestSchema,
} from '@/lib/filing/v2/contract-staff';
import type { JobSummary, SettlementFilter } from './types';

export const STAFF_API_BASE = '/api/admin/filing';

export interface FieldIssue {
  path: string;
  message: string;
}

export type ApiErrorCode = FilingErrorCode | 'network_error' | 'bad_response';

export interface ApiError {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields: FieldIssue[];
  retryAfter: number | null;
}

export type ApiFailure = { ok: false; error: ApiError };
export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  fetcher?: Fetcher;
}

const NETWORK_MESSAGE = 'Could not reach Lawsuit AI. Check your connection and try again.';
const BAD_RESPONSE_MESSAGE =
  'The server answered in a form this page does not expect. Refresh, and tell the team if it keeps happening.';

/** When an error body has no contract code, the status decides it. */
const CODE_FOR_STATUS: Readonly<Record<number, FilingErrorCode>> = {
  400: 'invalid_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'invalid_transition',
  415: 'unsupported_media_type',
  422: 'invalid_request',
  429: 'rate_limited',
  503: 'service_unavailable',
};

const ErrorBodySchema = z
  .object({
    error: z.string().optional(),
    code: z.string().optional(),
    fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    retry_after: z.number().optional(),
  })
  .passthrough();

function isFilingErrorCode(value: unknown): value is FilingErrorCode {
  return typeof value === 'string' && (FILING_ERROR_CODES as readonly string[]).includes(value);
}

export function localError(code: ApiErrorCode, message: string, fields: FieldIssue[] = []): ApiFailure {
  return { ok: false, error: { status: 0, code, message, fields, retryAfter: null } };
}

/** A FilingErrorBody (or anything else) as an ApiError. */
export function apiErrorFrom(status: number, body: unknown, retryAfterHeader: string | null = null): ApiError {
  const parsed = ErrorBodySchema.safeParse(body);
  const data = parsed.success ? parsed.data : {};
  const code: FilingErrorCode = isFilingErrorCode(data.code)
    ? data.code
    : (CODE_FOR_STATUS[status] ?? 'service_unavailable');
  const header = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;
  return {
    status,
    code,
    message: data.error?.trim() || FILING_ERROR_MESSAGES[code],
    fields: data.fields ?? [],
    retryAfter: typeof data.retry_after === 'number' ? data.retry_after : Number.isFinite(header) ? header : null,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function requestInit(options: RequestOptions, accept = 'application/json'): RequestInit {
  const headers: Record<string, string> = { Accept: accept };
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store', headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  return init;
}

async function send(path: string, options: RequestOptions, accept?: string): Promise<Response | ApiFailure> {
  const fetcher = options.fetcher ?? fetch;
  try {
    return await fetcher(path, requestInit(options, accept));
  } catch {
    return localError('network_error', NETWORK_MESSAGE);
  }
}

/** One JSON request; the answer must match `schema`. */
export async function staffJson<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<ApiResult<z.output<S>>> {
  const res = await send(path, options);
  if (!(res instanceof Response)) return res;
  const body = await readJson(res);
  if (!res.ok) return { ok: false, error: apiErrorFrom(res.status, body, res.headers.get('retry-after')) };
  const parsed = schema.safeParse(body);
  if (!parsed.success) return localError('bad_response', BAD_RESPONSE_MESSAGE);
  return { ok: true, status: res.status, data: parsed.data };
}

/** For answers the contract does not shape (result, resolve, bulk results): any 2xx counts. */
export const AnySuccessSchema = z.unknown();

/* Paths ------------------------------------------------------------------------ */

const enc = encodeURIComponent;

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface SettlementsQuery {
  q?: string;
  filter?: SettlementFilter;
  cursor?: string | null;
  limit?: number;
}

export interface JobsQuery {
  status?: JobStatus;
  channel?: AgentChannel;
  lawsuit_id?: string;
  cursor?: string | null;
  limit?: number;
}

const B = STAFF_API_BASE;

export const staffPaths = {
  settlements: (q: SettlementsQuery = {}) => `${B}/settlements${query({ ...q })}`,
  settlement: (lawsuitId: string) => `${B}/settlements/${enc(lawsuitId)}`,
  policies: () => `${B}/policies`,
  policy: (id: string) => `${B}/policies/${enc(id)}`,
  approvePolicy: (id: string) => `${B}/policies/${enc(id)}/approve`,
  rejectPolicy: (id: string) => `${B}/policies/${enc(id)}/reject`,
  killSwitch: () => `${B}/controls/kill-switch`,
  objection: () => `${B}/controls/objection`,
  specs: () => `${B}/specs`,
  spec: (id: string) => `${B}/specs/${enc(id)}`,
  validateSpec: (id: string) => `${B}/specs/${enc(id)}/validate`,
  approveSpec: (id: string) => `${B}/specs/${enc(id)}/approve`,
  retireSpec: (id: string) => `${B}/specs/${enc(id)}/retire`,
  jobs: (q: JobsQuery = {}) => `${B}/jobs${query({ ...q })}`,
  job: (id: string) => `${B}/jobs/${enc(id)}`,
  deskNext: () => `${B}/desk/next`,
  jobEvidence: (id: string) => `${B}/jobs/${enc(id)}/evidence`,
  jobResult: (id: string) => `${B}/jobs/${enc(id)}/result`,
  jobResolve: (id: string) => `${B}/jobs/${enc(id)}/resolve`,
  documentDownload: (id: string) => `${B}/documents/${enc(id)}/download`,
  bulkExports: () => `${B}/bulk/exports`,
  bulkResults: (batchId: string) => `${B}/bulk/exports/${enc(batchId)}/results`,
  roles: () => `${B}/roles`,
} as const;

/* Paged lists ------------------------------------------------------------------- */

export type PagedResult<T> = { ok: true; items: T[]; capped: boolean } | ApiFailure;

/** Follows next_cursor for at most `maxPages` pages; `capped` says more were left. */
export async function fetchAllPages<T>(
  page: (cursor: string | null) => Promise<ApiResult<{ items: T[]; next_cursor: string | null }>>,
  maxPages: number,
): Promise<PagedResult<T>> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i += 1) {
    const res = await page(cursor);
    if (!res.ok) return res;
    items.push(...res.data.items);
    cursor = res.data.next_cursor;
    if (!cursor) return { ok: true, items, capped: false };
  }
  return { ok: true, items, capped: true };
}

/** Every job matching `q` (no personal data), 100 per page. */
export function fetchJobs(
  q: Omit<JobsQuery, 'cursor' | 'limit'>,
  maxPages: number,
  fetcher?: Fetcher,
): Promise<PagedResult<JobSummary>> {
  return fetchAllPages(
    (cursor) => staffJson(staffPaths.jobs({ ...q, cursor, limit: 100 }), JobListResponseSchema, { fetcher }),
    maxPages,
  );
}

/* Bulk export (CSV) ----------------------------------------------------------------- */

export interface BulkExportFile {
  blob: Blob;
  batchId: string;
  rows: number | null;
  sha256: string | null;
  fileName: string;
}

function safeFileName(disposition: string | null): string | null {
  const match = disposition ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  const name = match?.[1]?.trim() ?? '';
  return /^[A-Za-z0-9._-]{1,120}$/.test(name) ? name : null;
}

/** POST .../bulk/exports: the CSV plus the batch id, row count and SHA-256 from the X-Export-* headers. */
export async function postBulkExport(
  body: z.input<typeof BulkExportRequestSchema>,
  fetcher?: Fetcher,
): Promise<ApiResult<BulkExportFile>> {
  const res = await send(staffPaths.bulkExports(), { method: 'POST', body, fetcher }, 'text/csv, application/json');
  if (!(res instanceof Response)) return res;
  if (!res.ok) return { ok: false, error: apiErrorFrom(res.status, await readJson(res), res.headers.get('retry-after')) };
  const batchId = res.headers.get('x-export-batch-id') ?? '';
  if (!UuidSchema.safeParse(batchId).success) return localError('bad_response', BAD_RESPONSE_MESSAGE);
  const rows = Number.parseInt(res.headers.get('x-export-rows') ?? '', 10);
  const sha = (res.headers.get('x-export-sha256') ?? '').toLowerCase();
  const blob = await res.blob();
  return {
    ok: true,
    status: res.status,
    data: {
      blob,
      batchId,
      rows: Number.isFinite(rows) ? rows : null,
      sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null,
      fileName: safeFileName(res.headers.get('content-disposition')) ?? `lawsuitai-$1-${batchId}.csv`,
    },
  };
}

/* Documents ---------------------------------------------------------------------- */

export type StaffDocument = { kind: 'url'; url: string } | { kind: 'blob'; blob: Blob };

const DownloadLinkSchema = z.object({ url: z.string().url() }).passthrough();

/**
 * GET .../documents/{id}/download (audit-logged by the server, which re-hashes
 * the bytes first). Answers either a short-lived link (JSON) or the file.
 */
export async function fetchStaffDocument(documentId: string, fetcher?: Fetcher): Promise<ApiResult<StaffDocument>> {
  const res = await send(staffPaths.documentDownload(documentId), { fetcher }, '*/*');
  if (!(res instanceof Response)) return res;
  if (!res.ok) return { ok: false, error: apiErrorFrom(res.status, await readJson(res), res.headers.get('retry-after')) };
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    const parsed = DownloadLinkSchema.safeParse(await readJson(res));
    if (!parsed.success || !/^https?:\/\//.test(parsed.data.url)) return localError('bad_response', BAD_RESPONSE_MESSAGE);
    return { ok: true, status: res.status, data: { kind: 'url', url: parsed.data.url } };
  }
  return { ok: true, status: res.status, data: { kind: 'blob', blob: await res.blob() } };
}

/* Evidence screenshots ------------------------------------------------------------- */

export const EVIDENCE_MIME_TYPES = EvidenceUploadRequestSchema.shape.mime.options;
export const EVIDENCE_TYPES_TEXT = 'a PNG, JPG or PDF up to 10 MB';

/** The slot POST .../jobs/{id}/evidence returns (shaped like the member DocumentSlotResponse). */
export const EvidenceSlotSchema = z
  .object({
    document: z.object({ id: UuidSchema }).passthrough(),
    upload: z.object({ signed_url: z.string().url() }).passthrough(),
  })
  .passthrough();

/**
 * Asks for an evidence slot, then PUTs the file to the signed upload URL
 * (never upsert). Returns the evidence document id for the result.
 */
export async function uploadEvidence(
  jobId: string,
  file: Blob,
  fetcher?: Fetcher,
): Promise<ApiResult<{ documentId: string }>> {
  const request = EvidenceUploadRequestSchema.safeParse({ mime: file.type, size_bytes: file.size });
  if (!request.success) return localError('document_invalid', `Use ${EVIDENCE_TYPES_TEXT}.`);
  const slot = await staffJson(staffPaths.jobEvidence(jobId), EvidenceSlotSchema, {
    method: 'POST',
    body: request.data,
    fetcher,
  });
  if (!slot.ok) return slot;
  const put = fetcher ?? fetch;
  let res: Response;
  try {
    res = await put(slot.data.upload.signed_url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
    });
  } catch {
    return localError('network_error', NETWORK_MESSAGE);
  }
  if (!res.ok) return localError('upload_incomplete', FILING_ERROR_MESSAGES.upload_incomplete);
  return { ok: true, status: res.status, data: { documentId: slot.data.document.id } };
}

/** Saves a blob through a temporary link (a download, never a page that runs code). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
