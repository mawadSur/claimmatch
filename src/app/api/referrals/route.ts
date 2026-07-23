import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const InviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
});

/** POST /api/referrals — record referral invites for the current user. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Sending invites is a spammy surface — cap it per user (else per IP).
  const limit = rateLimit(`referrals:${user?.id ?? ipKey(req)}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Enter at least one valid email.' },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .maybeSingle();
  const code = (profile?.referral_code as string) || user.id.slice(0, 8);

  const rows = parsed.data.emails.map((email) => ({
    referrer_id: user.id,
    code,
    referred_email: email.toLowerCase(),
    status: 'pending',
  }));

  // Ignore duplicates (unique on referrer_id + referred_email).
  const { data, error } = await supabase
    .from('referrals')
    .upsert(rows, { onConflict: 'referrer_id,referred_email', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('[referrals] insert failed:', error);
    return NextResponse.json({ error: 'Could not send your invites.' }, { status: 400 });
  }
  return NextResponse.json({ invited: data?.length ?? rows.length });
}

/** GET /api/referrals — the current user's referral records. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const limit = rateLimit(`referrals:get:${user?.id ?? ipKey(req)}`, { limit: 30 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }
  const { data } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });
  return NextResponse.json({ referrals: data ?? [] });
}
