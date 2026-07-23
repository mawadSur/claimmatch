import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * GET /api/account/export — data-portability download for the signed-in user.
 *
 * Returns a JSON file containing only the requesting user's own rows (profile,
 * claims, recoveries, matches, referrals). Every query is filtered to this
 * user's id, and the request-scoped client honors RLS on top of that, so a
 * caller can never export another person's data.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const limit = rateLimit(`account-export:${user?.id ?? ipKey(req)}`, { limit: 5 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const uid = user.id;

  const [profile, claims, recoveries, matches, referrals] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('claims').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('recoveries').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('matches').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('referrals').select('*').eq('referrer_id', uid).order('created_at', { ascending: false }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: uid, email: user.email ?? null },
    profile: profile.data ?? null,
    claims: claims.data ?? [],
    recoveries: recoveries.data ?? [],
    matches: matches.data ?? [],
    referrals: referrals.data ?? [],
  };

  const filename = `claimmatch-data-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
