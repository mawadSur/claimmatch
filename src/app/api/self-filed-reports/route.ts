import { NextResponse } from 'next/server';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { flags } from '@/lib/flags';
import { isJsonRequest } from '@/lib/json-request';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { parseSelfFiledReportBody, saveSelfFiledReport } from '@/lib/self-filed-report-server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { requestId } from '@/lib/claims-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/**
 * POST /api/self-filed-reports — "I filed this myself" on a match or claim.
 * Marks the claim reported_filed / submitted (existing timeline + scorecard)
 * and records a self_filed_reports row. Screenshot is a follow-up on
 * /api/self-filed-reports/[id]/screenshot.
 */
export async function POST(req: Request) {
  if (!flags.selfFiledReport()) return jsonApiNotFound();

  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable ? reply(AUTH_UNAVAILABLE, 503) : reply({ error: 'Please log in again.' }, 401);
  }
  const { user } = auth;

  const limited = rateLimit(`self-filed:${user.id}:${ipKey(req)}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return reply(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(limited.retryAfter) },
    );
  }

  if (!isJsonRequest(req)) return reply({ error: 'Send the request as JSON.' }, 415);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }

  const parsed = parseSelfFiledReportBody(body, new Date());
  if (!parsed.ok) return reply({ error: parsed.error }, 400);

  const saved = await saveSelfFiledReport({
    userId: user.id,
    email: user.email,
    lawsuitId: parsed.lawsuitId,
    confirmationNumber: parsed.confirmationNumber,
    filedOn: parsed.filedOn,
    requestId: requestId(req),
  });
  if (!saved.ok) return reply({ error: saved.error, code: saved.code }, saved.status);
  return reply({ ok: true, claim: saved.claim, report: saved.report, created: saved.created }, saved.created ? 201 : 200);
}
