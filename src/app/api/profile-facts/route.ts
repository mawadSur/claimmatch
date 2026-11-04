import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { parseProfileFacts } from '@/lib/profile-facts';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** GET /api/profile-facts — the signed-in user's structured facts. */
export async function GET() {
  if (!flags.profileV2()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });

  const { data, error } = await supabase
    .from('profile_facts')
    .select('id, type, value, start_date, end_date, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[profile-facts] list failed', { code: error.code });
    return NextResponse.json({ error: 'We couldn’t load your profile facts.' }, { status: 500 });
  }
  return NextResponse.json({ facts: data ?? [] });
}

/** PUT /api/profile-facts — replace the signed-in user's facts. */
export async function PUT(req: Request) {
  if (!flags.profileV2()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const list =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { facts?: unknown }).facts
      : body;
  const parsed = parseProfileFacts(list, { source: 'settings' });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error: delErr } = await supabase.from('profile_facts').delete().eq('user_id', user.id);
  if (delErr) {
    console.error('[profile-facts] replace delete failed', { code: delErr.code });
    return NextResponse.json({ error: 'We couldn’t save your profile facts.' }, { status: 500 });
  }
  if (parsed.facts.length > 0) {
    const { error: insErr } = await supabase.from('profile_facts').insert(
      parsed.facts.map((fact) => ({
        user_id: user.id,
        type: fact.type,
        value: fact.value,
        start_date: fact.start_date ?? null,
        end_date: fact.end_date ?? null,
        source: fact.source ?? 'settings',
      })),
    );
    if (insErr) {
      console.error('[profile-facts] replace insert failed', { code: insErr.code });
      return NextResponse.json({ error: 'We couldn’t save your profile facts.' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, count: parsed.facts.length });
}
