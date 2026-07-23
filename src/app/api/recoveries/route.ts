import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/recoveries — the current user's recoveries (money they've recovered),
 * newest first. ClaimMatch takes no cut, so net always equals gross. RLS
 * restricts rows to the signed-in user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('recoveries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[recoveries] list failed:', error);
    return NextResponse.json({ recoveries: [] });
  }

  return NextResponse.json({ recoveries: data ?? [] });
}
