import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { matchProfile } from '@/lib/matching';
import { SAMPLE_LAWSUITS } from '@/lib/sample-data';
import { FEE_PCT, estimateLawsuitValue } from '@/lib/recovery';
import type { Lawsuit, Profile } from '@/lib/types';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FileAllSchema = z.object({
  signature_name: z
    .string()
    .trim()
    .min(2, 'Please type your full legal name to authorize filing.'),
});

/** First hop of x-forwarded-for. */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}

/**
 * POST /api/claims/file-all — one signed action files every eligible,
 * not-yet-claimed match for the current user. Recomputes matches from the saved
 * profile, then inserts a claim (+ recovery row) per eligible real-DB lawsuit.
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

  const parsed = FileAllSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }
  const { signature_name } = parsed.data;

  // Load the user's saved profile (state + attributes drive matching).
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const profile: Profile =
    (profileRow as Profile) ??
    ({
      id: user.id,
      email: user.email ?? null,
      full_name: null,
      state: null,
      zip: null,
      attributes: {},
      email_opt_in: false,
      onboarded: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Profile);

  // Candidate lawsuits: published only, degrading to sample data.
  let lawsuits: Lawsuit[] = [];
  try {
    const { data } = await supabase
      .from('lawsuits')
      .select('*')
      .eq('review_status', 'published');
    if (data && data.length > 0) lawsuits = data as Lawsuit[];
  } catch {
    // fall through to sample data
  }
  if (lawsuits.length === 0) lawsuits = SAMPLE_LAWSUITS;

  const byId = new Map(lawsuits.map((l) => [l.id, l]));
  const results = matchProfile(profile, lawsuits);

  // Which lawsuits has the user already claimed?
  const { data: existingClaims } = await supabase
    .from('claims')
    .select('lawsuit_id')
    .eq('user_id', user.id);
  const alreadyClaimed = new Set(
    (existingClaims ?? []).map((c) => c.lawsuit_id as string),
  );

  const now = new Date().toISOString();
  const ip = clientIp(req);
  // Service client is used for recovery inserts (RLS write-blocked). It may be
  // unconfigured in dev — degrade gracefully to claims-only in that case.
  let service: ReturnType<typeof createServiceClient> | null = null;
  try {
    service = createServiceClient();
  } catch {
    service = null;
  }

  const receipts: { slug: string; receipt_number: number }[] = [];

  for (const r of results) {
    // Only real DB lawsuits are fileable; sample ids have no durable row.
    if (!UUID_RE.test(r.lawsuit_id)) continue;
    if (alreadyClaimed.has(r.lawsuit_id)) continue;

    const lawsuit = byId.get(r.lawsuit_id);
    if (!lawsuit) continue;

    const estimated_value = estimateLawsuitValue(lawsuit);

    try {
      const { data: claim, error } = await supabase
        .from('claims')
        .insert({
          user_id: user.id,
          lawsuit_id: r.lawsuit_id,
          lawsuit_title: lawsuit.title,
          status: 'submitted',
          form_data: {},
          signature_name,
          authorized_at: now,
          authorization_ip: ip,
          filed_at: now,
          estimated_value,
        })
        .select('id, receipt_number')
        .single();

      if (error || !claim) {
        // Duplicate (race) or per-item failure — skip and keep going.
        continue;
      }

      alreadyClaimed.add(r.lawsuit_id);

      if (service) {
        const { error: recErr } = await service.from('recoveries').insert({
          user_id: user.id,
          claim_id: claim.id,
          gross_amount: 0,
          fee_pct: FEE_PCT,
          status: 'pending',
        });
        if (recErr && recErr.code !== '23505') {
          console.error('[file-all] recovery insert failed:', recErr);
        }
      }

      receipts.push({ slug: lawsuit.slug, receipt_number: claim.receipt_number });
    } catch (err) {
      console.error('[file-all] per-item error:', err);
      // continue with the next match
    }
  }

  return NextResponse.json({ filed: receipts.length, receipts });
}
