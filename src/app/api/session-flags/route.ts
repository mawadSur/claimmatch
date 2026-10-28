import { NextResponse } from 'next/server';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/session-flags — mark internal testers and copy a soft-launch
 * cohort onto the signed-in profile. Returns { internal, cohort } so the
 * client can identify() without sending an email to PostHog.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }

  const flags = await applySessionFlags({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true, ...flags });
}
