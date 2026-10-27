import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { isProofFeedbackAnswer } from '@/lib/proof-feedback';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/proof-feedback — signed-in, one answer per user and settlement.
 * Never returned as a public fact. Flagged off (404).
 */
export async function POST(req: Request) {
  if (!flags.proofFeedback()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to answer.' }, { status: 401 });
  }

  const limited = rateLimit(`proof-feedback:${user.id}:${ipKey(req)}`, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many answers. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const record = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as { lawsuit_id?: unknown; answer?: unknown })
    : {};
  const lawsuitId = typeof record.lawsuit_id === 'string' ? record.lawsuit_id.trim() : '';
  if (!lawsuitId) {
    return NextResponse.json({ error: 'A settlement is required.' }, { status: 400 });
  }
  if (!isProofFeedbackAnswer(record.answer)) {
    return NextResponse.json({ error: 'Answer must be yes, no, or not_sure.' }, { status: 400 });
  }

  const { error } = await supabase.from('proof_feedback').insert({
    lawsuit_id: lawsuitId,
    user_id: user.id,
    answer: record.answer,
  });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'You already answered for this settlement.' },
        { status: 409 },
      );
    }
    console.error('[proof-feedback] insert failed', { code: error.code });
    return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Own answer for a settlement, if any. */
export async function GET(req: Request) {
  if (!flags.proofFeedback()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to answer.' }, { status: 401 });
  }

  const lawsuitId = new URL(req.url).searchParams.get('lawsuit_id')?.trim() ?? '';
  if (!lawsuitId) {
    return NextResponse.json({ error: 'A settlement is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('proof_feedback')
    .select('answer')
    .eq('user_id', user.id)
    .eq('lawsuit_id', lawsuitId)
    .maybeSingle();
  if (error) {
    console.error('[proof-feedback] read failed', { code: error.code });
    return NextResponse.json({ error: 'Could not load your answer.' }, { status: 500 });
  }
  return NextResponse.json({ answer: data?.answer ?? null });
}
