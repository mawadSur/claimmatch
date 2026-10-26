import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseSettingsInput } from '@/lib/settings-input';

export const runtime = 'nodejs';

/** POST /api/settings — update the signed-in user's details and email choice. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again to save your settings.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = parseSettingsInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (Object.keys(parsed.patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('profiles').update(parsed.patch).eq('id', user.id);
  if (error) {
    // Log the code only: Postgres error details can echo row values (PII).
    console.error('[settings] update failed', { code: error.code });
    return NextResponse.json(
      { error: 'We couldn’t save your settings. Please try again.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
