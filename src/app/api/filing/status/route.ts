import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { listUserFilingJobs } from '@/lib/filing/queue';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/filing/status — the signed-in user's filing jobs. */
export async function GET() {
  if (!flags.assistedFiling()) {
    return NextResponse.json({ jobs: [] });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }
  const jobs = await listUserFilingJobs(user.id);
  return NextResponse.json({ jobs });
}
