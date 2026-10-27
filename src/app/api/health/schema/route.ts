import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { checkRequiredSchema } from '@/lib/schema-check';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Post-deploy schema check. Confirms the columns and functions the code
 * needs (0010–0012). Auth: the cron secret (fails closed). Service-role,
 * read-only probes. Never returns secrets or row data.
 *
 * 200 when the schema is complete; 503 listing missing items; 401/403
 * without the secret.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await checkRequiredSchema(createServiceClient());
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, missing: result.missing, present: result.present },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, present: result.present });
  } catch (err) {
    console.error('[health/schema]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, missing: ['schema probe failed'], present: [] },
      { status: 503 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
