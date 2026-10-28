import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTHORIZATION_VERSION,
  authorizationText,
  clientIp,
  clientUserAgent,
} from '@/lib/filing/authorization';
import { assistedFilingAllowed, queueFilingJob } from '@/lib/filing/queue';
import { flags } from '@/lib/flags';
import { startTrackingClaim } from '@/lib/claims-server';
import { toClaimView } from '@/lib/claims';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  lawsuit_id: z.string().uuid(),
  claim_id: z.string().uuid().optional().nullable(),
  accepted: z.literal(true),
  text_version: z.string().optional(),
});

/**
 * POST /api/filing/authorize — store the signed authorization and queue a
 * filing job. Off unless ASSISTED_FILING_ENABLED=1. Never talks to an
 * official form from this route.
 */
export async function POST(req: Request) {
  if (!flags.assistedFiling()) {
    return NextResponse.json({ error: 'Assisted filing is turned off.' }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the authorization box and try again.' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: lawsuit } = await svc
    .from('lawsuits')
    .select('id, title, assisted_filing_allowed')
    .eq('id', parsed.data.lawsuit_id)
    .maybeSingle();
  if (!lawsuit || !assistedFilingAllowed(lawsuit)) {
    return NextResponse.json({ error: 'Assisted filing is not available for this settlement.' }, { status: 403 });
  }

  let claimId = parsed.data.claim_id ?? null;
  if (!claimId) {
    const existing = await supabase
      .from('claims')
      .select('*')
      .eq('user_id', user.id)
      .eq('lawsuit_id', parsed.data.lawsuit_id)
      .maybeSingle();
    if (existing.data) {
      claimId = toClaimView(existing.data as Record<string, unknown>).id;
    } else {
      const started = await startTrackingClaim({
        userId: user.id,
        lawsuitId: parsed.data.lawsuit_id,
        lawsuitTitle: String(lawsuit.title ?? 'Settlement'),
        detail: { action: 'start_tracking', intent: 'assisted_filing' },
      });
      if (!started.ok || !started.claim) {
        return NextResponse.json({ error: 'We could not start tracking this claim.' }, { status: 400 });
      }
      claimId = started.claim.id;
    }
  }

  const version = parsed.data.text_version || AUTHORIZATION_VERSION;
  const { data: authRow, error: authError } = await svc
    .from('claim_authorizations')
    .upsert(
      {
        claim_id: claimId,
        user_id: user.id,
        lawsuit_id: parsed.data.lawsuit_id,
        text_version: version,
        full_text: authorizationText(version),
        signed_at: new Date().toISOString(),
        ip: clientIp(req),
        user_agent: clientUserAgent(req),
      },
      { onConflict: 'claim_id' },
    )
    .select('*')
    .single();
  if (authError || !authRow) {
    console.error('[filing] authorization failed', { code: authError?.code });
    return NextResponse.json({ error: 'We could not save your authorization.' }, { status: 500 });
  }

  const queued = await queueFilingJob({
    claimId,
    userId: user.id,
    lawsuitId: parsed.data.lawsuit_id,
    authorizationId: authRow.id as string,
  });
  if (!queued.ok) {
    return NextResponse.json({ error: queued.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    authorization_id: authRow.id,
    job: { id: queued.job.id, status: queued.job.status },
  });
}
