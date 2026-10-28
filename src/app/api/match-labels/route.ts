import { NextResponse } from 'next/server';
import { z } from 'zod';
import { flags } from '@/lib/flags';
import { isMatchLabelKind, recordMatchEvent, upsertMatchLabel } from '@/lib/match-events';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Lawsuit, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  lawsuit_id: z.string().uuid(),
  label: z.string(),
  payout_amount: z.number().min(0).max(100000).optional().nullable(),
  score: z.number().min(0).max(1).optional().nullable(),
  matched_signals: z.array(z.string()).optional(),
});

/** POST /api/match-labels — user-reported match outcome. */
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
  if (!parsed.success || !isMatchLabelKind(parsed.data.label)) {
    return NextResponse.json({ error: 'Choose not relevant, submitted, or paid.' }, { status: 400 });
  }

  const saved = await upsertMatchLabel({
    userId: user.id,
    lawsuitId: parsed.data.lawsuit_id,
    label: parsed.data.label,
    payoutAmount: parsed.data.payout_amount,
  });

  const eventType =
    parsed.data.label === 'not_relevant'
      ? 'dismiss'
      : parsed.data.label === 'paid'
        ? 'user_reported_payout'
        : 'filed';

  const svc = createServiceClient();
  const [{ data: profile }, { data: lawsuit }] = await Promise.all([
    svc.from('profiles').select('state, attributes, match_metrics_consent_at').eq('id', user.id).maybeSingle(),
    svc
      .from('lawsuits')
      .select('eligibility, category, deadline, proof_required, proof_verified, payout_min, payout_max')
      .eq('id', parsed.data.lawsuit_id)
      .maybeSingle(),
  ]);

  await recordMatchEvent({
    userId: user.id,
    lawsuitId: parsed.data.lawsuit_id,
    eventType,
    score: parsed.data.score,
    matchedSignals: parsed.data.matched_signals,
    payoutAmount: parsed.data.payout_amount,
    profile: (profile as Pick<Profile, 'state' | 'attributes'> | null) ?? null,
    lawsuit: (lawsuit as Lawsuit | null) ?? null,
    consented: Boolean((profile as { match_metrics_consent_at?: string | null } | null)?.match_metrics_consent_at),
  });

  return NextResponse.json({ ok: true, stored: saved });
}
