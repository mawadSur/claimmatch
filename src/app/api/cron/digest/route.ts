import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { notifyNewMatches, type MatchNotifyItem } from '@/lib/notifications';
import type { Lawsuit, Profile } from '@/lib/types';
import { maybeAlertCronFailure } from '@/lib/cron-alert';
import { recordCronFailure } from '@/lib/jobs';
import {
  D50_PAUSED,
  buildReport,
  digestGate,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '../_lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Weekly digest (Mondays 15:00 UTC, vercel.json). Paused by D50: it answers 200
 * with { skipped: "paused (D50)" } and sends nothing unless DIGEST_ENABLED=1.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const gate = digestGate(flags.digest());
  if (!gate.run) {
    return NextResponse.json(
      { ...buildReport('digest', { digest: gate.step }), skipped: D50_PAUSED },
      { status: 200 },
    );
  }

  const configProblem = serviceConfigProblem(process.env);
  const step = configProblem
    ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
    : await runStep('digest', sendDigest);
  const report = buildReport('digest', { digest: step });
  if (step.status === 'failed') {
    await recordCronFailure('cron/digest', step.error);
  }
  await maybeAlertCronFailure(report);
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

/**
 * The pre-D50 digest: email every opted-in, onboarded user a summary of their
 * current matches on published settlements. Before this is switched back on
 * (Phase 1), it must use the shared open-for-claims rule and the Phase 1 send
 * path instead of this matches query.
 */
async function sendDigest(): Promise<{ users: number; emailed: number }> {
  const supabase = createServiceClient();

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email_opt_in', true)
    .eq('onboarded', true);
  if (profileError) throw new Error(`profiles query failed (code ${profileError.code ?? 'unknown'})`);
  const profiles = (profileData ?? []) as Profile[];

  let emailed = 0;
  for (const profile of profiles) {
    if (!profile.email) continue;

    const { data: matchRows, error: matchError } = await supabase
      .from('matches')
      .select('*, lawsuit:lawsuits(*)')
      .eq('user_id', profile.id)
      .eq('dismissed', false)
      .order('score', { ascending: false })
      .limit(6);
    if (matchError) throw new Error(`matches query failed (code ${matchError.code ?? 'unknown'})`);

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

  return { users: profiles.length, emailed };
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
