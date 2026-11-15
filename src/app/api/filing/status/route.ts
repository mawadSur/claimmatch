import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { listUserFilingJobs } from '@/lib/filing/queue';
import { AUTH_UNAVAILABLE, getRequestUser } from '@/lib/supabase/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/filing/status — the signed-in user's filing jobs. The web's
 * session cookie or the app's bearer token (getRequestUser), like every other
 * /api/filing route.
 */
export async function GET(req: Request) {
  if (!flags.assistedFiling()) {
    return NextResponse.json({ jobs: [] });
  }
  const auth = await getRequestUser(req);
  if (!auth.user) {
    return auth.unavailable
      ? NextResponse.json(AUTH_UNAVAILABLE, { status: 503 })
      : NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }
  const jobs = await listUserFilingJobs(auth.user.id);
  return NextResponse.json({ jobs });
}
