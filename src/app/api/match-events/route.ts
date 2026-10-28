import { NextResponse } from 'next/server';
import { z } from 'zod';
import { flags } from '@/lib/flags';
import { isMatchEventType, recordMatchEvent } from '@/lib/match-events';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Lawsuit, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  lawsuit_id: z.string().uuid(),
  event_type: z.string(),
  score: z.number().min(0).max(1).optional().nullable(),
  rank: z.number().int().min(1).max(500).optional().nullable(),
  matched_signals: z.array(z.string()).optional(),
  payout_amount: z.number().nonnegative().optional().nullable(),
});

/** POST /api/match-events — log a structured match interaction. */
export async function POST(req: Request) {
  if (!flags.matchMetrics()) {
    return NextResponse.json({ ok: true, stored: false });
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
  if (!parsed.success || !isMatchEventType(parsed.data.event_type)) {
    return NextResponse.json({ error: 'Unknown match event.' }, { status: 400 });
  }

  const svc = createServiceClient();
  const [{ data: profile }, { data: lawsuit }] = await Promise.all([
    svc.from('profiles').select('state, attributes, match_metrics_consent_at').eq('id', user.id).maybeSingle(),
    svc
      .from('lawsuits')
      .select('eligibility, category, deadline, proof_required, proof_verified, payout_min, payout_max')
      .eq('id', parsed.data.lawsuit_id)
      .maybeSingle(),
  ]);

  const { eventId } = await recordMatchEvent({
    userId: user.id,
    lawsuitId: parsed.data.lawsuit_id,
    eventType: parsed.data.event_type,
    score: parsed.data.score,
    rank: parsed.data.rank,
    matchedSignals: parsed.data.matched_signals,
    payoutAmount: parsed.data.payout_amount,
    profile: (profile as Pick<Profile, 'state' | 'attributes'> | null) ?? null,
    lawsuit: (lawsuit as Lawsuit | null) ?? null,
    consented: Boolean((profile as { match_metrics_consent_at?: string | null } | null)?.match_metrics_consent_at),
  });

  return NextResponse.json({ ok: true, stored: Boolean(eventId) });
}
