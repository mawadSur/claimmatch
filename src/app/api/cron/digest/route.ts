import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authorizeCron } from '@/lib/cron-auth';
import { sendClosingSoonEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { closingSoonEmailGate, pickClosingSoonEmailRows } from '@/lib/closing-soon-email';
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
  type StepResult,
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
  const steps: Record<string, StepResult> = {};

  if (!gate.run) {
    steps.digest = gate.step;
  } else {
    const configProblem = serviceConfigProblem(process.env);
    steps.digest = configProblem
      ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
      : await runStep('digest', sendDigest);
  }

  const closingReady = closingSoonEmailGate();
  if (!closingReady.ok) {
    steps.closingSoonEmail = {
      status: 'skipped',
      reason:
        closingReady.reason === 'flag_off'
          ? 'CLOSING_SOON_EMAIL_ENABLED is off'
          : closingReady.reason,
      resume:
        'Set CLOSING_SOON_EMAIL_ENABLED=1 only after a ClaimMatch inbox, verified sender, and postal address exist (B2/B3).',
    };
  } else {
    const configProblem = serviceConfigProblem(process.env);
    steps.closingSoonEmail = configProblem
      ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
      : await runStep('closingSoonEmail', sendClosingSoon);
  }

  const report = buildReport('digest', steps);
  if (steps.digest.status === 'failed') {
    await recordCronFailure('cron/digest', steps.digest.error);
  }
  if (steps.closingSoonEmail.status === 'failed') {
    await recordCronFailure('cron/closing-soon-email', steps.closingSoonEmail.error);
  }
  await maybeAlertCronFailure(report);
  const paused = !gate.run ? { skipped: D50_PAUSED } : {};
  return NextResponse.json({ ...report, ...paused }, { status: reportHttpStatus(report) });
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

/**
 * C15: verified listings closing in 14 days, to email_opt_in users only.
 * sendClosingSoonEmail refuses again if the flag, postal address, or sender
 * is missing.
 */
async function sendClosingSoon(): Promise<{
  users: number;
  emailed: number;
  listed: number;
  skipped: string | null;
}> {
  const gate = closingSoonEmailGate();
  if (!gate.ok) {
    return { users: 0, emailed: 0, listed: 0, skipped: gate.reason };
  }

  const supabase = createServiceClient();
  const { data: lawsuitData, error: lawsuitError } = await supabase
    .from('lawsuits')
    .select('*')
    .eq('review_status', 'published');
  if (lawsuitError) throw new Error(`lawsuits query failed (code ${lawsuitError.code ?? 'unknown'})`);

  const items = pickClosingSoonEmailRows((lawsuitData ?? []) as Lawsuit[]).map((row) => ({
    title: row.title,
    slug: row.slug,
    deadline: row.deadline as string,
  }));
  if (items.length === 0) {
    return { users: 0, emailed: 0, listed: 0, skipped: null };
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email_opt_in', true);
  if (profileError) throw new Error(`profiles query failed (code ${profileError.code ?? 'unknown'})`);
  const profiles = (profileData ?? []) as Profile[];

  let emailed = 0;
  for (const profile of profiles) {
    if (!profile.email) continue;
    await sendClosingSoonEmail(profile.email, {
      name: profile.full_name ?? undefined,
      items,
      to: profile.email,
    });
    emailed += 1;
  }
  return { users: profiles.length, emailed, listed: items.length, skipped: null };
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
