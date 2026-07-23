import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

interface EraseResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Right-to-erasure core for the signed-in user.
 *
 * Verifies the session, then removes every row that holds this person's PII,
 * deepest FK dependency first, and finally deletes the auth user. Rows are
 * cleared with the service client (bypasses RLS) so the erasure is complete
 * even if a policy would otherwise scope the delete. We never touch another
 * user's data — every statement is filtered to this user's id/email.
 */
async function eraseAccount(req: Request): Promise<EraseResult> {
  const limit = rateLimit(`account-delete:${ipKey(req)}`, { limit: 5 });
  if (!limit.ok) {
    return { ok: false, status: 429, error: 'Too many requests, please slow down.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Not signed in.' };
  }

  const uid = user.id;
  const email = user.email?.toLowerCase() ?? null;
  const admin = createServiceClient();

  // Delete in FK-dependency order (children before parents). Every table
  // cascades from auth.users, but we clear public rows explicitly so nothing
  // lingers if the auth delete can't run (e.g. no service-role key locally).
  const steps: { table: string; run: () => Promise<{ error: unknown }> }[] = [
    { table: 'recoveries', run: () => admin.from('recoveries').delete().eq('user_id', uid) },
    { table: 'claims', run: () => admin.from('claims').delete().eq('user_id', uid) },
    { table: 'matches', run: () => admin.from('matches').delete().eq('user_id', uid) },
    { table: 'referrals', run: () => admin.from('referrals').delete().eq('referrer_id', uid) },
    { table: 'notifications', run: () => admin.from('notifications').delete().eq('user_id', uid) },
    { table: 'profiles', run: () => admin.from('profiles').delete().eq('id', uid) },
  ];

  for (const step of steps) {
    const { error } = await step.run();
    if (error) {
      console.error(`[account/delete] failed clearing ${step.table}:`, error);
      return {
        ok: false,
        status: 500,
        error: 'Could not delete your data. Please contact support.',
      };
    }
  }

  // Newsletter subscription is keyed by email, not user id.
  if (email) {
    const { error } = await admin.from('subscribers').delete().eq('email', email);
    if (error) {
      // Non-fatal: the account-bound PII is already gone. Log and continue.
      console.error('[account/delete] failed clearing subscribers:', error);
    }
  }

  // Finally remove the auth identity itself. Requires the service-role key.
  const { error: authError } = await admin.auth.admin.deleteUser(uid);
  if (authError) {
    console.error('[account/delete] auth user delete failed:', authError);
    return {
      ok: false,
      status: 500,
      error:
        'Your data was removed, but the login could not be deleted. Please contact support to finish closing your account.',
    };
  }

  // Clear the session cookies on this device.
  await supabase.auth.signOut();

  return { ok: true, status: 200 };
}

/**
 * DELETE /api/account/delete — programmatic erasure. Returns JSON so a fetch()
 * caller can react (e.g. sign out client-side and redirect).
 */
export async function DELETE(req: Request) {
  const result = await eraseAccount(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, deleted: true });
}

/**
 * POST /api/account/delete — form-navigation erasure. Used by the no-JS
 * confirmation form on the settings page: on success we 303-redirect the
 * browser to the goodbye screen; on failure we redirect back with an error
 * flag so the page can surface it.
 */
export async function POST(req: Request) {
  const result = await eraseAccount(req);
  if (!result.ok) {
    const back = new URL('/settings', req.url);
    back.searchParams.set('error', 'delete');
    return NextResponse.redirect(back, { status: 303 });
  }
  const done = new URL('/', req.url);
  done.searchParams.set('deleted', '1');
  return NextResponse.redirect(done, { status: 303 });
}
