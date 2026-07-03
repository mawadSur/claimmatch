import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { FEE_PCT, estimateLawsuitValue } from '@/lib/recovery';

export const runtime = 'nodejs';

/**
 * Ensure a recovery row exists for a claim (accounting). Writes to `recoveries`
 * are service-role only (no RLS insert policy). Idempotent — a duplicate
 * (claim_id unique) is a no-op, so this is safe to call on every success path
 * and self-heals a previously-missing recovery.
 */
async function ensureRecovery(userId: string, claimId: string): Promise<void> {
  try {
    const service = createServiceClient();
    const { error } = await service.from('recoveries').insert({
      user_id: userId,
      claim_id: claimId,
      gross_amount: 0,
      fee_pct: FEE_PCT,
      status: 'pending',
    });
    if (error && error.code !== '23505') {
      console.error('[claims] recovery insert failed:', error);
    }
  } catch (err) {
    console.error('[claims] recovery insert threw:', err);
  }
}

const ClaimSchema = z.object({
  // Must be a real DB lawsuit id. Sample-catalog ids aren't UUIDs and have no
  // durable row to reference, so filing isn't available until the DB is seeded.
  lawsuit_id: z
    .string()
    .uuid('This settlement isn’t available to file yet — please check back soon.'),
  form_data: z.record(z.unknown()).optional(),
  signature_name: z
    .string()
    .trim()
    .min(2, 'Please type your full legal name to authorize filing.'),
});

/** Read the originating client IP (first hop of x-forwarded-for). */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}

/**
 * POST /api/claims — the user e-signs a services authorization and we file (or
 * fetch) their claim for one lawsuit, then open a recovery row for accounting.
 *
 * Idempotent: claims are UNIQUE(user_id, lawsuit_id), so an existing claim is
 * returned rather than duplicated.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { lawsuit_id, signature_name } = parsed.data;
  const form_data = parsed.data.form_data ?? {};

  // If the user already has a claim for this lawsuit, return it unchanged.
  const existing = await supabase
    .from('claims')
    .select('id, receipt_number, status, estimated_value')
    .eq('user_id', user.id)
    .eq('lawsuit_id', lawsuit_id)
    .maybeSingle();
  if (existing.data) {
    // Backfill the recovery row in case a prior attempt failed to create one.
    await ensureRecovery(user.id, existing.data.id);
    return NextResponse.json(existing.data);
  }

  // Resolve the lawsuit from the DB. The user-session client honors RLS, whose
  // public-read policy only exposes review_status='published' rows — so a null
  // result means this is not a published settlement the user may file against.
  const { data: lawsuitRow } = await supabase
    .from('lawsuits')
    .select('id, title, estimated_value_min, estimated_value_max, payout_min, payout_max')
    .eq('id', lawsuit_id)
    .maybeSingle();
  if (!lawsuitRow) {
    return NextResponse.json(
      { error: 'That settlement isn’t available to file. It may not be open yet, or it has closed.' },
      { status: 404 },
    );
  }
  const lawsuit_title = (lawsuitRow.title as string) || 'Class Action Claim';
  const estimated_value = estimateLawsuitValue(lawsuitRow);

  const now = new Date().toISOString();
  const ip = clientIp(req);

  const { data, error } = await supabase
    .from('claims')
    .insert({
      user_id: user.id,
      lawsuit_id,
      lawsuit_title,
      status: 'submitted',
      form_data,
      signature_name,
      authorized_at: now,
      authorization_ip: ip,
      filed_at: now,
      estimated_value,
    })
    .select('id, receipt_number, status, estimated_value')
    .single();

  if (error) {
    // Lost a race on the unique constraint — re-fetch and return the winner.
    if (error.code === '23505') {
      const again = await supabase
        .from('claims')
        .select('id, receipt_number, status, estimated_value')
        .eq('user_id', user.id)
        .eq('lawsuit_id', lawsuit_id)
        .maybeSingle();
      if (again.data) {
        await ensureRecovery(user.id, again.data.id);
        return NextResponse.json(again.data);
      }
    }
    // Foreign-key violation: the lawsuit id is a valid UUID but no such row.
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'That settlement could not be found. It may have closed.' },
        { status: 404 },
      );
    }
    console.error('[claims] insert failed:', error);
    return NextResponse.json({ error: 'Could not file your claim.' }, { status: 400 });
  }

  // Open a recovery row for accounting (service-role write; idempotent).
  await ensureRecovery(user.id, data.id);

  return NextResponse.json(data);
}

/** GET /api/claims — the current user's claims, newest first, with lawsuit + recovery. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('claims')
    .select('*, lawsuit:lawsuits(*), recovery:recoveries(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[claims] list failed:', error);
    return NextResponse.json({ claims: [] });
  }

  return NextResponse.json({ claims: data ?? [] });
}
