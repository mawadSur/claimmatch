import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authorizeCron } from '@/lib/cron-auth';
import { notifyNewMatches, type MatchNotifyItem } from '@/lib/notifications';
import type { Lawsuit, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Weekly digest: email every opted-in, onboarded user a summary of the open
 * settlements they currently match. Doubles as the "we're still watching for
 * you" retention touch. Only counts published lawsuits.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ skipped: true });
  }

  try {
    const supabase = createServiceClient();

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('email_opt_in', true)
      .eq('onboarded', true);
    const profiles = (profileData ?? []) as Profile[];

    let emailed = 0;
    for (const profile of profiles) {
      if (!profile.email) continue;

      const { data: matchRows } = await supabase
        .from('matches')
        .select('*, lawsuit:lawsuits(*)')
        .eq('user_id', profile.id)
        .eq('dismissed', false)
        .order('score', { ascending: false })
        .limit(6);

      const rows = (matchRows ?? []) as { lawsuit?: Lawsuit }[];
      const items: MatchNotifyItem[] = rows
        .map((m) => m.lawsuit)
        .filter((l): l is Lawsuit => !!l && l.review_status === 'published')
        .map((l) => ({
          title: l.title,
          slug: l.slug,
          typical_payout: l.typical_payout,
          deadline: l.deadline,
        }));

      if (items.length === 0) continue;

      await notifyNewMatches(
        { id: profile.id, email: profile.email, full_name: profile.full_name },
        items,
      );
      emailed += 1;
    }

    return NextResponse.json({ users: profiles.length, emailed });
  } catch (err) {
    console.error('[cron/digest] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Digest failed.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
