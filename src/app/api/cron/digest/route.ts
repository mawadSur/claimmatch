import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authorizeCron } from '@/lib/cron-auth';
import { sendClosingSoonEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { closingSoonEmailGate, pickClosingSoonEmailRows } from '@/lib/closing-soon-email';
import { notifyNewMatches, type MatchNotifyItem } from '@/lib/notifications';
import { applySettlementGuide, applySettlementGuides } from '@/lib/settlement-guides';
import {
  isEmailableStoredMatch,
  MATCH_EMAIL_SCORE_THRESHOLD,
  wantsWeeklyMatchEmails,
} from '@/lib/match-email';
import type { Lawsuit, Match, Profile } from '@/lib/types';
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
 * Weekly new-match digest: opted-in weekly subscribers only. Emails
 * unnotified stored matches at or above MATCH_EMAIL_SCORE_THRESHOLD via
 * Resend, then marks notified_at. Instant subscribers are handled by the
 * daily sweep. Unsubscribed accounts are never loaded.
 */
async function sendDigest(): Promise<{ users: number; emailed: number }> {
  const supabase = createServiceClient();

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email_opt_in', true)
    .eq('onboarded', true)
    .eq('email_frequency', 'weekly');
  if (profileError) throw new Error(`profiles query failed (code ${profileError.code ?? 'unknown'})`);
  const profiles = ((profileData ?? []) as Profile[]).filter(wantsWeeklyMatchEmails);

  let emailed = 0;
  for (const profile of profiles) {
    if (!profile.email) continue;

    const { data: matchRows, error: matchError } = await supabase
      .from('matches')
      .select('id, score, dismissed, notified_at, lawsuit:lawsuits(*)')
      .eq('user_id', profile.id)
      .eq('dismissed', false)
      .is('notified_at', null)
      .gte('score', MATCH_EMAIL_SCORE_THRESHOLD)
      .order('score', { ascending: false });
    if (matchError) throw new Error(`matches query failed (code ${matchError.code ?? 'unknown'})`);

    const rows = (matchRows ?? []) as (Pick<Match, 'id' | 'score' | 'dismissed' | 'notified_at'> & {
      lawsuit?: Lawsuit | null;
    })[];
    const pending = rows.filter(
      (row) => isEmailableStoredMatch(row) && !!row.lawsuit && row.lawsuit.review_status === 'published',
    );
    // Official-notice guides: the payout and deadline the settlement page shows.
    const items: MatchNotifyItem[] = pending
      .map((m) => m.lawsuit)
      .filter((l): l is Lawsuit => !!l)
      .map(applySettlementGuide)
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
    const ids = pending.map((row) => row.id);
    const { error: markErr } = await supabase
      .from('matches')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids);
    if (markErr) {
      console.error(`[digest] mark notified failed for ${profile.id}:`, markErr);
    }
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

  // A guided settlement is closing soon by its official deadline, not the feed's.
  const items = pickClosingSoonEmailRows(applySettlementGuides((lawsuitData ?? []) as Lawsuit[])).map((row) => ({
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
