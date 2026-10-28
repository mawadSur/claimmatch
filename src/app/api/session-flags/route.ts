import { NextResponse } from 'next/server';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/session-flags — mark internal testers and copy a soft-launch
 * cohort onto the signed-in profile. Returns { internal, cohort } so the
 * client can identify() without sending an email to PostHog. Signed out: 204.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Signed-out visitors call this on every page load; nothing to do, and a
    // 401 here would only add console noise.
    return new NextResponse(null, { status: 204 });
  }

  const flags = await applySessionFlags({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true, ...flags });
}
