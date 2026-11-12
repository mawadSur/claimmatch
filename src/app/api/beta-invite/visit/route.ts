import { NextResponse } from 'next/server';
import { sanitizeRef } from '@/lib/attribution';
import { flags } from '@/lib/flags';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { isJsonRequest } from '@/lib/json-request';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { recordBetaInviteVisit } from '@/lib/beta-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/beta-invite/visit — log a /invite?code= hit on share_link_clicks
 * when the code exists. No PII. Flagged off (404).
 */
export async function POST(req: Request) {
  if (!flags.betaInviteCodes()) return jsonApiNotFound();

  const limited = rateLimit(`beta-invite-visit:${ipKey(req)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const code =
    body && typeof body === 'object' && !Array.isArray(body)
      ? sanitizeRef((body as { code?: unknown }).code)
      : null;
  if (!code) {
    return NextResponse.json({ error: 'A code is required.' }, { status: 400 });
  }

  const recorded = await recordBetaInviteVisit(code);
  return NextResponse.json({ ok: true, recorded });
}
