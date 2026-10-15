import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { estimateLawsuitValue } from '@/lib/recovery';

export const runtime = 'nodejs';

const PacketSchema = z.object({
  lawsuit_id: z
    .string()
    .uuid('This settlement isn’t available yet — please check back soon.'),
  form_data: z.record(z.unknown()).optional(),
});

/**
 * POST /api/claims — create or update a claim packet (status = processing).
 * Does not mark the claim submitted, does not set filed_at, and does not
 * create a recovery. "Submitted" happens only via PATCH after the user
 * reports they filed on the official site.
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

  const parsed = PacketSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { lawsuit_id } = parsed.data;
  const form_data = parsed.data.form_data ?? {};

  const existing = await supabase
    .from('claims')
    .select('id, receipt_number, status, estimated_value, form_data, user_submitted_at, confirmation_number')
    .eq('user_id', user.id)
    .eq('lawsuit_id', lawsuit_id)
    .maybeSingle();

  if (existing.data) {
    const alreadyReported = Boolean(existing.data.user_submitted_at) ||
      existing.data.status === 'submitted' ||
      existing.data.status === 'approved' ||
      existing.data.status === 'paid';
    if (alreadyReported) {
      return NextResponse.json(existing.data);
    }
    const { data: updated, error: updateErr } = await supabase
      .from('claims')
      .update({ form_data })
      .eq('id', existing.data.id)
      .eq('user_id', user.id)
      .select('id, receipt_number, status, estimated_value, form_data, user_submitted_at, confirmation_number')
      .single();
    if (updateErr) {
      console.error('[claims] packet update failed:', updateErr);
      return NextResponse.json({ error: 'Could not save your claim details.' }, { status: 400 });
    }
    return NextResponse.json(updated);
  }

  const { data: lawsuitRow } = await supabase
    .from('lawsuits')
    .select('id, title, estimated_value_min, estimated_value_max, payout_min, payout_max, status, deadline')
    .eq('id', lawsuit_id)
    .maybeSingle();
  if (!lawsuitRow) {
    return NextResponse.json(
      { error: 'That settlement isn’t available. It may not be open yet, or it has closed.' },
      { status: 404 },
    );
  }
  const lawsuit_title = (lawsuitRow.title as string) || 'Class Action Claim';
  const estimated_value = estimateLawsuitValue(lawsuitRow);

  const { data, error } = await supabase
    .from('claims')
    .insert({
      user_id: user.id,
      lawsuit_id,
      lawsuit_title,
      status: 'processing',
      form_data,
      estimated_value,
    })
    .select('id, receipt_number, status, estimated_value, form_data, user_submitted_at, confirmation_number')
    .single();

  if (error) {
    if (error.code === '23505') {
      const again = await supabase
        .from('claims')
        .select('id, receipt_number, status, estimated_value, form_data, user_submitted_at, confirmation_number')
        .eq('user_id', user.id)
        .eq('lawsuit_id', lawsuit_id)
        .maybeSingle();
      if (again.data) return NextResponse.json(again.data);
    }
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'That settlement could not be found. It may have closed.' },
        { status: 404 },
      );
    }
    console.error('[claims] insert failed:', error);
    return NextResponse.json({ error: 'Could not save your claim details.' }, { status: 400 });
  }

  return NextResponse.json(data);
}

/** GET /api/claims — the current user's claim packets, newest first. */
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
