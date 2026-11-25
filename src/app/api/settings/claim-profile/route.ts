import { NextResponse } from 'next/server';
import { isJsonRequest } from '@/lib/json-request';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { rateLimit } from '@/lib/ratelimit';
import { flags } from '@/lib/flags';
import { parseClaimProfileInput } from '@/lib/claim-profile';
import { loadClaimProfile, saveClaimProfile } from '@/lib/claim-profile-server';

export const runtime = 'nodejs';

/** GET /api/settings/claim-profile — signed-in claim profile (no SSN/bank/PIN). */
export async function GET(req: Request) {
  if (!flags.claimProfile()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }
  const profile = await loadClaimProfile(auth.supabase, auth.user.id);
  return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
}

/** PUT /api/settings/claim-profile — save the shared claim profile. */
export async function PUT(req: Request) {
  if (!flags.claimProfile()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Please log in again to save your claim profile.' }, { status: 401 });
  }
  const { supabase, user } = auth;
  const limit = rateLimit(`claim-profile:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
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
  const parsed = parseClaimProfileInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, field: parsed.field ?? null }, { status: 400 });
  }
  const saved = await saveClaimProfile(supabase, user.id, parsed.profile, parsed.profilePatch);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }
  const profile = await loadClaimProfile(supabase, user.id);
  return NextResponse.json({ ok: true, profile });
}
