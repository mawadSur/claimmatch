/**
 * Shared plumbing for the member filing API (src/app/api/filing/claims/**):
 * the flag (404 before anything else), who is calling (bearer or cookie, via
 * getRequestUser), rate limits, JSON-only writes, zod at the boundary, and
 * FilingErrorBody answers with private, uncacheable headers. Logs carry codes
 * only, never personal data.
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ZodError, ZodType, ZodTypeDef } from 'zod';
import { flags } from '@/lib/flags';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { getRequestUser } from '@/lib/supabase/request-user';
import {
  FILING_DB_ERRORS,
  FILING_ERROR_HTTP,
  FILING_ERROR_MESSAGES,
  FILING_RATE_LIMITS,
  type FilingErrorBody,
  type FilingErrorCode,
  type JevIssueView,
} from './contract';

export const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' } as const;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FilingLimit = keyof typeof FILING_RATE_LIMITS;
export type FieldError = { path: string; message: string };

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

export function fail(
  code: FilingErrorCode,
  extras: { issues?: JevIssueView[]; fields?: FieldError[]; retryAfter?: number } = {},
): Response {
  const body: FilingErrorBody = { error: FILING_ERROR_MESSAGES[code], code };
  if (extras.issues) body.issues = extras.issues;
  if (extras.fields) body.fields = extras.fields;
  const headers: Record<string, string> = {};
  if (extras.retryAfter !== undefined) {
    body.retry_after = extras.retryAfter;
    headers['Retry-After'] = String(extras.retryAfter);
  }
  return reply(body, FILING_ERROR_HTTP[code], headers);
}

/** Codes and the place only: database messages can echo row values. */
export function logFilingError(where: string, error?: { code?: string | null } | null): void {
  console.error(`[filing] ${where}`, { code: error?.code ?? null });
}

/** An API code for a database or RPC error (FILING_DB_ERRORS), service_unavailable otherwise. */
export function dbErrorCode(error: { code?: string | null } | null | undefined): FilingErrorCode {
  const code = error?.code ?? '';
  return Object.prototype.hasOwnProperty.call(FILING_DB_ERRORS, code) ? FILING_DB_ERRORS[code] : 'service_unavailable';
}

export function dbFailure(where: string, error: { code?: string | null } | null | undefined): Response {
  const code = dbErrorCode(error);
  if (code === 'service_unavailable') logFilingError(where, error);
  return fail(code);
}

export interface FilingCaller {
  user: User;
  supabase: SupabaseClient;
  via: 'bearer' | 'cookie';
}

export type Begin = { ok: true; caller: FilingCaller } | { ok: false; response: Response };

/**
 * Every member route starts here, in this order: the flag (404, before auth
 * or any read), the caller (401, or 503 when Auth could not check a token),
 * the rate limit (429), and for writes the JSON media type (415).
 */
export async function beginFilingRoute(req: Request, limit: FilingLimit, opts: { json?: boolean } = {}): Promise<Begin> {
  if (!flags.oneClickFiling()) return { ok: false, response: fail('not_found') };
  const auth = await getRequestUser(req);
  if (!auth.user) return { ok: false, response: fail(auth.unavailable ? 'auth_unavailable' : 'unauthorized') };
  const rule = FILING_RATE_LIMITS[limit];
  const verdict = rateLimit(`${rule.key}:${auth.user.id}`, { limit: rule.limit, windowMs: rule.windowMs });
  if (!verdict.ok) return { ok: false, response: fail('rate_limited', { retryAfter: verdict.retryAfter }) };
  if (opts.json && !isJsonRequest(req)) return { ok: false, response: fail('unsupported_media_type') };
  return { ok: true, caller: { user: auth.user, supabase: auth.supabase, via: auth.via } };
}

export function zodFields(error: ZodError): FieldError[] {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
}

/** Reads and checks a JSON body. An empty body counts as {} (for the routes that take an empty object). */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown = {};
  try {
    const text = await req.text();
    if (text.trim() !== '') raw = JSON.parse(text);
  } catch {
    return { ok: false, response: fail('invalid_request', { fields: [{ path: '(body)', message: 'Send valid JSON.' }] }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: fail('invalid_request', { fields: zodFields(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

/** The route's claim id, or null when it is not a UUID (answered 404, like a claim that is not yours). */
export async function claimIdParam(params: Promise<{ claimId: string }>): Promise<string | null> {
  const { claimId } = await params;
  return UUID_RE.test(claimId) ? claimId.toLowerCase() : null;
}

export function requestUserAgent(req: Request): string | null {
  return req.headers.get('user-agent')?.trim().slice(0, 512) || null;
}

export function requestIdOf(req: Request): string | null {
  const id = req.headers.get('x-vercel-id') ?? req.headers.get('x-request-id');
  return id ? id.slice(0, 128) : null;
}
