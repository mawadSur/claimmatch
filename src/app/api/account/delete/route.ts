import { NextResponse } from 'next/server';
import { USER_OWNED_TABLES } from '@/lib/account-deletion';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/delete — self-serve deletion. Body must be { confirm: "DELETE" }.
 * Removes owned rows and the auth user. Writes an audit row with no PII.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
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

  for (const table of USER_OWNED_TABLES) {
    try {
      if (table === 'referrals') {
        await svc.from(table).delete().eq('referrer_id', user.id);
        continue;
      }
      const { error } = await svc.from(table).delete().eq(table === 'profiles' ? 'id' : 'user_id', user.id);
      if (error) console.error('[account-delete] row delete failed', { table, code: error.code });
    } catch (err) {
      console.error('[account-delete] row delete failed', { table, err });
    }
  }

  const { error: authError } = await svc.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error('[account-delete] auth delete failed', { message: authError.message });
    return NextResponse.json({ error: 'Could not finish deleting the account.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
