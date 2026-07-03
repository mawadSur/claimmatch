import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const SettingsSchema = z.object({
  email_opt_in: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  phone: z.string().trim().max(32).optional(),
  full_name: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
});

/** POST /api/settings — update the current user's profile preferences. */
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

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input.' },
      { status: 400 },
    );
  }

  // Only write the fields that were actually provided.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    console.error('[settings] update failed:', error);
    return NextResponse.json({ error: 'Could not save your settings.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
