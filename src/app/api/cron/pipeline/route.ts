import { NextResponse } from 'next/server';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { authorizeCron } from '@/lib/cron-auth';

// Uses the service-role client + Anthropic SDK + source adapters → Node runtime,
// never statically cached, and allowed to run long enough to extract a batch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const summary = await ingestAndExtract();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron/pipeline] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed.' },
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
