import { NextResponse } from 'next/server';
import { EXPLICIT_DELETE_ORDER } from '@/lib/account-deletion';
import { isJsonRequest } from '@/lib/json-request';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/delete — self-serve deletion. Body must be { confirm: "DELETE" }.
 * Writes an audit row with no PII, removes owned rows, then the auth user,
 * whose ON DELETE CASCADE takes the profile and claim events with it.
 */
export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }
  const { user } = auth;

  const limit = rateLimit(`account-delete:${user.id}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in 10 minutes.' },
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
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }
  const confirm =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { confirm?: unknown }).confirm
      : null;
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }

  const svc = createServiceClient();
  try {
    await svc.from('account_deletion_audit').insert({ reason: 'self_serve' });
  } catch (err) {
    console.error('[account-delete] audit failed', err);
  }

  // The profile is never deleted here: if deleteUser failed after that, the
  // user would keep a valid session with no profile row.
  for (const table of EXPLICIT_DELETE_ORDER) {
    try {
      const { error } = await svc
        .from(table)
        .delete()
        .eq(table === 'referrals' ? 'referrer_id' : 'user_id', user.id);
      if (error) console.error('[account-delete] row delete failed', { table, code: error.code });
    } catch (err) {
      console.error('[account-delete] row delete failed', { table, err });
    }
  }

  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (email) {
    try {
      const { error } = await svc.from('match_alert_tokens').delete().eq('email', email);
      if (error) console.error('[account-delete] row delete failed', { table: 'match_alert_tokens', code: error.code });
    } catch (err) {
      console.error('[account-delete] row delete failed', { table: 'match_alert_tokens', err });
    }
  }

  const { error: authError } = await svc.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error('[account-delete] auth delete failed', { message: authError.message });
    return NextResponse.json({ error: 'Could not finish deleting the account.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
