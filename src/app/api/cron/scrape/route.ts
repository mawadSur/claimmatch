import { NextResponse } from 'next/server';
import { runAllSources } from '@/lib/scraper';
import { authorizeCron } from '@/lib/cron-auth';

export const runtime = 'nodejs';
// Scraping can take a while; keep this off the static edge and long-lived.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const summary = await runAllSources();
    return NextResponse.json(summary ?? { ok: true });
  } catch (err) {
    console.error('[cron/scrape] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
