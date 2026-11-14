/**
 * Shared plumbing for the staff and law-firm API (/api/admin/filing/**,
 * docs/designs/one-click-filing.md, section 10): the flag (404 before
 * anything else), the cookie-session staff check (401 / 403), the rate
 * limit, JSON-only writes from this site's own pages, zod at the boundary and
 * error bodies in the FilingErrorBody shape.
 */
import { NextResponse } from 'next/server';
import type { z, ZodTypeAny } from 'zod';
import { FILING_DB_ERRORS, FILING_ERROR_HTTP, FILING_ERROR_MESSAGES, FILING_RATE_LIMITS, type FilingErrorCode } from '@/lib/filing/v2/contract';
import { flags } from '@/lib/flags';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { canOpenFilingConsole, recordStaffAccess, staffForRequest, type StaffAccessEntry, type StaffCheck, type StaffUser } from '@/lib/staff-roles';

const HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fields = Array<{ path: string; message: string }>;
export type Failure = { ok: false; res: NextResponse };

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...HEADERS, ...headers } });
}

export function fail(
  code: FilingErrorCode,
  extra: { fields?: Fields; issues?: unknown[]; retry_after?: number } = {},
  headers: Record<string, string> = {},
): NextResponse {
  return reply({ error: FILING_ERROR_MESSAGES[code], code, ...extra }, FILING_ERROR_HTTP[code], headers);
}

export function zodFields(error: z.ZodError): Fields {
  return error.issues.slice(0, 50).map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** A database error (SQLSTATE) as an API failure. */
export function dbFail(error: { code?: string | null } | null | undefined, overrides: Partial<Record<string, FilingErrorCode>> = {}): NextResponse {
  const state = error?.code ?? '';
  const code = overrides[state] ?? FILING_DB_ERRORS[state] ?? (state === '22P02' ? 'invalid_request' : 'service_unavailable');
  if (code === 'service_unavailable') console.error('[admin/filing] database error', { code: state || null });
  return fail(code);
}

/** A write from another site (a browser sends Origin cross-site) is refused, cookie or not. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/**
 * flag -> staff session -> the route's check -> rate limit. 404 with the flag
 * off, 401 signed out, 403 forbidden for non-staff, 403 role_required for
 * staff without the check, 429 over the limit.
 */
export async function guard(
  req: Request,
  check: StaffCheck,
  limit: keyof typeof FILING_RATE_LIMITS = 'staff',
): Promise<{ ok: true; staff: StaffUser } | Failure> {
  if (!flags.oneClickFiling()) return { ok: false, res: fail('not_found') };
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return { ok: false, res: fail('forbidden') };
  const auth = await staffForRequest(canOpenFilingConsole);
  if (!auth.ok) return { ok: false, res: fail(auth.status === 401 ? 'unauthorized' : 'forbidden') };
  if (!check(auth.staff)) return { ok: false, res: fail('role_required') };
  const rule = FILING_RATE_LIMITS[limit];
  const rl = rateLimit(`${rule.key}:${auth.staff.id}`, { limit: rule.limit, windowMs: rule.windowMs });
  if (!rl.ok) {
    return { ok: false, res: fail('rate_limited', { retry_after: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) }) };
  }
  return { ok: true, staff: auth.staff };
}

/** The JSON body, parsed by `schema`. An empty body counts as {} only with allowEmpty. */
export async function readBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
  opts: { allowEmpty?: boolean } = {},
): Promise<{ ok: true; data: z.infer<S> } | Failure> {
  let text = '';
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: fail('invalid_request') };
  }
  let raw: unknown = {};
  if (text.trim() || !opts.allowEmpty) {
    if (!isJsonRequest(req)) return { ok: false, res: fail('unsupported_media_type') };
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, res: fail('invalid_request', { fields: [{ path: '', message: 'Not valid JSON' }] }) };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: fail('invalid_request', { fields: zodFields(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

/** The query string, parsed by `schema` (unknown keys refused when the schema is strict). */
export function readQuery<S extends ZodTypeAny>(req: Request, schema: S): { ok: true; data: z.infer<S> } | Failure {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) return { ok: false, res: fail('invalid_request', { fields: zodFields(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

/** A route id (UUID) or a 404. */
export async function routeId<K extends string>(params: Promise<Record<K, string>>, key: K): Promise<{ ok: true; id: string } | Failure> {
  const value = (await params)[key];
  return typeof value === 'string' && UUID.test(value) ? { ok: true, id: value.toLowerCase() } : { ok: false, res: fail('not_found') };
}

/** Writes the audit row first; when it cannot be written, nothing personal is shown (503). */
export async function audited(entry: StaffAccessEntry): Promise<NextResponse | null> {
  return (await recordStaffAccess(entry)) ? null : fail('service_unavailable');
}

/** Offset cursors for staff lists ("<number>"), capped. */
export function offsetOf(cursor: string | undefined): number {
  const n = Number(cursor ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : 0;
}
