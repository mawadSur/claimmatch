import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { listAdminFilingJobs } from '@/lib/filing/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/filing — admin filing-job list. */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.assistedFiling()) {
    return NextResponse.json({ jobs: [], enabled: false });
  }
  const jobs = await listAdminFilingJobs();
  return NextResponse.json({ jobs, enabled: true });
}
