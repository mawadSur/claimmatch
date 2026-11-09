import { NextResponse } from 'next/server';
import { isJsonRequest } from '@/lib/json-request';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { applyAttributePatch } from '@/lib/profile-attributes';
import { rateLimit } from '@/lib/ratelimit';
import { parseSettingsInput } from '@/lib/settings-input';

export const runtime = 'nodejs';

/** POST /api/settings — update the signed-in user's details and email choice. */
export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Please log in again to save your settings.' }, { status: 401 });
  }
  const { supabase, user } = auth;

  const limit = rateLimit(`settings:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  // JSON only: a same-site form or text/plain post cannot reach this route
  // without a CORS preflight (defense in depth on top of SameSite cookies).
  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = parseSettingsInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (Object.keys(parsed.patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const patch = { ...parsed.patch };
  if (patch.attributes) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('attributes')
      .eq('id', user.id)
      .maybeSingle();
    patch.attributes = applyAttributePatch(
      (existing?.attributes as Record<string, unknown> | null) ?? {},
      patch.attributes,
    );
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    // Log the code only: Postgres error details can echo row values (PII).
    console.error('[settings] update failed', { code: error.code });
    return NextResponse.json(
      { error: 'We couldn’t save your settings. Please try again.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
