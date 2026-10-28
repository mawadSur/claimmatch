import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { runOfficialLinkCheck } from '@/lib/link-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Weekly official-link checker. Vercel Hobby only allows two crons, so this
 * route is also invoked from /api/cron/daily on Mondays when the flag is on.
 * Never unpublishes a listing.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!flags.linkCheck()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'LINK_CHECK_ENABLED is off' });
  }

  const result = await runOfficialLinkCheck();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
