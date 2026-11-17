import { NextResponse } from 'next/server';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { flags } from '@/lib/flags';
import { isJsonRequest } from '@/lib/json-request';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { createSelfFiledScreenshotSlot, deleteSelfFiledScreenshot } from '@/lib/self-filed-report-server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function begin(req: Request) {
  if (!flags.selfFiledReport()) return { ok: false as const, response: jsonApiNotFound() };
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return {
      ok: false as const,
      response: auth.unavailable ? reply(AUTH_UNAVAILABLE, 503) : reply({ error: 'Please log in again.' }, 401),
    };
  }
  const limited = rateLimit(`self-filed-shot:${auth.user.id}:${ipKey(req)}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return {
      ok: false as const,
      response: reply(
        { error: 'Too many requests. Please wait a moment and try again.' },
        429,
        { 'Retry-After': String(limited.retryAfter) },
      ),
    };
  }
  return { ok: true as const, user: auth.user };
}

/**
 * POST /api/self-filed-reports/[id]/screenshot — owner-only. Body:
 * { mime, bytes }. Validates type and size, then returns a signed upload URL
 * for the private bucket. Never accepts a public upload.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = await begin(req);
  if (!started.ok) return started.response;
  if (!isJsonRequest(req)) return reply({ error: 'Send the request as JSON.' }, 415);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }
  const rec = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const { id } = await params;
  const slot = await createSelfFiledScreenshotSlot({
    userId: started.user.id,
    reportId: id,
    mime: rec.mime,
    bytes: rec.bytes,
  });
  if (!slot.ok) return reply({ error: slot.error }, slot.status);
  return reply({ ok: true, report: slot.report, upload: slot.upload });
}

/**
 * DELETE /api/self-filed-reports/[id]/screenshot — owner-only. Removes the
 * private file and clears the screenshot columns.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = await begin(req);
  if (!started.ok) return started.response;
  const { id } = await params;
  const removed = await deleteSelfFiledScreenshot({ userId: started.user.id, reportId: id });
  if (!removed.ok) return reply({ error: removed.error }, removed.status);
  return reply({ ok: true, report: removed.report });
}
