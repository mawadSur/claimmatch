import { NextResponse } from 'next/server';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { flags } from '@/lib/flags';
import { persistOfficialFormOpen } from '@/lib/official-form-opens';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/official-form-opens: first-open-wins log for signed-in official-form
 * clicks. No-op when DID_YOU_FILE_EMAIL_ENABLED is off. Never required for
 * the link itself to work.
 */
export async function POST(req: Request) {
  if (!flags.didYouFileEmail()) return reply({ ok: true, skipped: true });
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable ? reply(AUTH_UNAVAILABLE, 503) : reply({ ok: true, skipped: true });
  }
  const limit = rateLimit(`official-form-opens:${auth.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return reply({ error: 'Too many requests. Please wait a moment and try again.' }, 429);
  }
  if (!isJsonRequest(req)) return reply({ error: 'Send the request as JSON.' }, 415);
  let lawsuitId: string | null = null;
  try {
    const body = (await req.json()) as { lawsuit_id?: unknown };
    if (typeof body.lawsuit_id === 'string') lawsuitId = body.lawsuit_id;
  } catch {
    return reply({ error: 'Send a lawsuit_id.' }, 400);
  }
  if (!lawsuitId || !UUID_RE.test(lawsuitId)) return reply({ error: 'Send a lawsuit_id.' }, 400);
  const result = await persistOfficialFormOpen({ userId: auth.user.id, lawsuitId });
  if (result.reason === 'unavailable' || result.reason === 'error') {
    return reply({ ok: false }, 503);
  }
  return reply({ ok: true });
}
