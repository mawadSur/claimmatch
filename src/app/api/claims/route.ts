import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { SAMPLE_LAWSUITS } from '@/lib/sample-data';

const ClaimSchema = z.object({
  // Must be a real DB lawsuit id. Sample-catalog ids aren't UUIDs and have no
  // durable row to reference, so filing isn't available until the DB is seeded.
  lawsuit_id: z
    .string()
    .uuid('This settlement isn’t available to file yet — please check back soon.'),
  form_data: z.record(z.unknown()).optional(),
});

/**
 * POST /api/claims — file (or fetch) a claim for the current user + lawsuit.
 * Idempotent: because claims are UNIQUE(user_id, lawsuit_id), an existing claim
 * is returned rather than duplicated.
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

  const { lawsuit_id } = parsed.data;
  const form_data = parsed.data.form_data ?? {};

  // If the user already has a claim for this lawsuit, return it unchanged.
  const existing = await supabase
    .from('claims')
    .select('id, receipt_number, status')
    .eq('user_id', user.id)
    .eq('lawsuit_id', lawsuit_id)
    .maybeSingle();
  if (existing.data) {
    return NextResponse.json(existing.data);
  }

  // Resolve the lawsuit title from the DB, falling back to sample data (sample
  // ids aren't UUIDs, so the DB lookup may error — that's fine).
  let lawsuit_title = 'Class Action Claim';
  try {
    const { data: lawsuitRow } = await supabase
      .from('lawsuits')
      .select('title')
      .eq('id', lawsuit_id)
      .maybeSingle();
    if (lawsuitRow?.title) lawsuit_title = lawsuitRow.title as string;
  } catch {
    // ignore — fall through to sample lookup
  }
  if (lawsuit_title === 'Class Action Claim') {
    const sample = SAMPLE_LAWSUITS.find((l) => l.id === lawsuit_id);
    if (sample) lawsuit_title = sample.title;
  }

  const { data, error } = await supabase
    .from('claims')
    .insert({
      user_id: user.id,
      lawsuit_id,
      lawsuit_title,
      status: 'processing',
      form_data,
    })
    .select('id, receipt_number, status')
    .single();

  if (error) {
    // Lost a race on the unique constraint — re-fetch and return the winner.
    if (error.code === '23505') {
      const again = await supabase
        .from('claims')
        .select('id, receipt_number, status')
        .eq('user_id', user.id)
        .eq('lawsuit_id', lawsuit_id)
        .maybeSingle();
      if (again.data) return NextResponse.json(again.data);
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

  return NextResponse.json(data);
}

/** GET /api/claims — the current user's claims, newest first, with lawsuit. */
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
    .select('*, lawsuit:lawsuits(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[claims] list failed:', error);
    return NextResponse.json({ claims: [] });
  }

  return NextResponse.json({ claims: data ?? [] });
}
