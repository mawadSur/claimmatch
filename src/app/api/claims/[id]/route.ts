import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ReportSchema = z.object({
  confirmation_number: z.string().trim().max(120).optional(),
  submitted_on: z.string().trim().max(32).optional(),
});

/**
 * PATCH /api/claims/:id — the owner reports they submitted the official form.
 * Sets user_submitted_at, confirmation_number, and status = 'submitted'.
 * Ownership is checked in application code and enforced by RLS.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input.' },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from('claims')
    .select('id, user_id, status, user_submitted_at')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  }

  const submittedAt = parsed.data.submitted_on
    ? new Date(parsed.data.submitted_on).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(new Date(submittedAt).getTime())) {
    return NextResponse.json({ error: 'That date is not valid.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    user_submitted_at: existing.user_submitted_at ?? submittedAt,
    status: 'submitted',
  };
  if (parsed.data.confirmation_number !== undefined) {
    patch.confirmation_number = parsed.data.confirmation_number || null;
  }

  const { data, error } = await supabase
    .from('claims')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, receipt_number, status, user_submitted_at, confirmation_number')
    .single();

  if (error) {
    console.error('[claims] report submitted failed:', error);
    return NextResponse.json({ error: 'Could not save your submission.' }, { status: 400 });
  }

  return NextResponse.json(data);
}
