import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { leadRevenueAtClick } from '@/lib/partners';
import type { Partner } from '@/lib/types';

export const runtime = 'nodejs';

/** Constant-time secret comparison that never throws on length mismatch. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const PostbackSchema = z.object({
  subid: z.string().uuid('subid must be the lead event id'),
  status: z.enum(['converted', 'rejected', 'paid']).optional(),
  revenue_cents: z.number().int().min(0).max(100_000_00).optional(),
  external_ref: z.string().trim().max(256).optional(),
});

/**
 * POST /api/partners/postback — a partner reports the outcome of a referral.
 * Authenticated by a shared secret (PARTNER_POSTBACK_SECRET) in the
 * `x-postback-secret` header or `?secret=`. Updates the lead event's status and
 * attributed revenue. Feature is disabled (503) until the secret is configured.
 */
export async function POST(req: Request) {
  const expected = process.env.PARTNER_POSTBACK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'Postbacks are not configured.' },
      { status: 503 },
    );
  }

  const provided =
    req.headers.get('x-postback-secret') ||
    new URL(req.url).searchParams.get('secret');
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = PostbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input.' },
      { status: 400 },
    );
  }
  const { subid, status = 'converted', revenue_cents, external_ref } = parsed.data;

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 503 });
  }

  // Load the event + its partner to compute revenue when the partner didn't
  // send an explicit amount.
  const { data: event, error } = await service
    .from('lead_events')
    .select('*, partner:partners(*)')
    .eq('id', subid)
    .maybeSingle();

  if (error || !event) {
    return NextResponse.json({ error: 'Lead event not found.' }, { status: 404 });
  }

  const partner = (event.partner as Partner | null) ?? null;
  const converting = status === 'converted' || status === 'paid';

  let revenue = event.revenue_cents as number;
  if (typeof revenue_cents === 'number') {
    revenue = revenue_cents;
  } else if (converting && partner) {
    // Lead fee already accrued at click; add the conversion (CPA) fee.
    revenue = leadRevenueAtClick(partner) + partner.conversion_fee_cents;
  } else if (status === 'rejected') {
    revenue = 0;
  }

  const { error: updErr } = await service
    .from('lead_events')
    .update({
      status,
      revenue_cents: revenue,
      external_ref: external_ref ?? event.external_ref,
      converted_at: converting ? new Date().toISOString() : event.converted_at,
    })
    .eq('id', subid);

  if (updErr) {
    console.error('[partners/postback] update failed:', updErr);
    return NextResponse.json({ error: 'Could not record postback.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subid, status, revenue_cents: revenue });
}
