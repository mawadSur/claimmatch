import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { isJsonRequest } from '@/lib/json-request';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { betaFeedbackInsertRow, parseBetaFeedbackInput } from '@/lib/beta-feedback';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/beta-feedback — signed-in, one row per user.
 * Never emails. Flagged off (404).
 */
export async function GET() {
  if (!flags.betaFeedback()) return jsonApiNotFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to continue.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('beta_feedback')
    .select('id, interview_opt_in, dismissed, created_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[beta-feedback] read failed', { code: error.code });
    return NextResponse.json({ error: 'Could not load your response.' }, { status: 500 });
  }
  return NextResponse.json({
    submitted: Boolean(data),
    dismissed: Boolean(data?.dismissed),
    interview_opt_in: Boolean(data?.interview_opt_in),
  });
}

export async function POST(req: Request) {
  if (!flags.betaFeedback()) return jsonApiNotFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to continue.' }, { status: 401 });
  }

  const limited = rateLimit(`beta-feedback:${user.id}:${ipKey(req)}`, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many responses. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = parseBetaFeedbackInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const row = betaFeedbackInsertRow(user.id, parsed.input);
  const { error } = await supabase.from('beta_feedback').upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.error('[beta-feedback] write failed', { code: error.code });
    return NextResponse.json({ error: 'Could not save your response.' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    dismissed: parsed.input.dismissed,
    interview_opt_in: parsed.input.interviewOptIn,
  });
}
