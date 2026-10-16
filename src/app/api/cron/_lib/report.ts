/**
 * Shared by the cron routes. Each route reports every step it ran, skipped or
 * failed, and answers 500 when any step failed, so a paused or broken job is
 * never a silent 200.
 *
 * D50 (until the Phase 1 engine and send path ship): the match sweep, which
 * also sends the match email, and the Monday digest are paused. They run only
 * when their flag in @/lib/flags is on (env var set to exactly "1"). Ingest
 * keeps running so the catalog stays current.
 */

import type { IngestSummary } from '@/lib/scraper/pipeline';

export const D50_PAUSED = 'paused (D50)';

export type StepResult =
  | { status: 'ran'; result: unknown }
  | { status: 'skipped'; reason: string; resume?: string }
  /** `result` is kept when the step ran but needs a person (see checkIngestStep). */
  | { status: 'failed'; error: string; result?: unknown };

export interface CronReport {
  job: string;
  /** False when any step failed. */
  ok: boolean;
  ranSteps: string[];
  skippedSteps: string[];
  failedSteps: string[];
  steps: Record<string, StepResult>;
}

/** Whether a gated step may run, and the step to report when it may not. */
export type Gate = { run: true } | { run: false; step: StepResult };

function pausedByD50(envVar: string): StepResult {
  return {
    status: 'skipped',
    reason: D50_PAUSED,
    resume: `Set ${envVar}=1 once the Phase 1 engine and send path ship.`,
  };
}

/** D50: the match sweep and the match email it sends. */
export function matchSweepGate(matchEmailsEnabled: boolean): Gate {
  return matchEmailsEnabled ? { run: true } : { run: false, step: pausedByD50('MATCH_EMAILS_ENABLED') };
}

/** D50: the Monday digest. */
export function digestGate(digestEnabled: boolean): Gate {
  return digestEnabled ? { run: true } : { run: false, step: pausedByD50('DIGEST_ENABLED') };
}

/**
 * Missing server config the jobs need, or null. Without the service role key
 * the server client falls back to the anon key, row-level security blocks the
 * writes, and a job would "succeed" having done nothing.
 */
export function serviceConfigProblem(env: Record<string, string | undefined>): string | null {
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!env[name]) return `${name} is not set`;
  }
  return null;
}

/** A step that can't run for lack of config: a failure in production, a skip elsewhere. */
export function missingConfigStep(problem: string, production: boolean): StepResult {
  return production ? { status: 'failed', error: problem } : { status: 'skipped', reason: problem };
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'Unknown error';
}

/** Run one step, turning a throw into a reported failure. */
export async function runStep(
  label: string,
  fn: () => Promise<unknown>,
  log: (...args: unknown[]) => void = console.error,
): Promise<StepResult> {
  try {
    return { status: 'ran', result: await fn() };
  } catch (err) {
    log(`[cron] ${label} failed:`, err);
    return { status: 'failed', error: errorMessage(err) };
  }
}

/**
 * What in an ingest summary needs a person: held closures, failed reads or
 * writes, and sources that returned nothing. Each one leaves "open" listings
 * that the source has closed, so none may pass as a quiet success.
 */
export function ingestProblems(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const s = result as Partial<IngestSummary>;
  const problems: string[] = [];
  if ((s.held ?? 0) > 0) {
    problems.push(
      `${s.held} closures held for review (listed in heldClosures; raise INGEST_MAX_CLOSE_SHARE only after reviewing every one)`,
    );
  }
  if ((s.failed ?? 0) > 0) problems.push(`${s.failed} catalog reads or writes failed`);
  if (s.emptySources && s.emptySources.length > 0) {
    problems.push(`no records from ${s.emptySources.join(', ')}`);
  }
  return problems;
}

/**
 * The ingest step as the cron reports it. Until D40's alerting exists, a run
 * that needs a person counts as failed (so the route answers 500), and keeps
 * its summary so the response and the run record still list every held row.
 */
export function checkIngestStep(step: StepResult): StepResult {
  if (step.status !== 'ran') return step;
  const problems = ingestProblems(step.result);
  if (problems.length === 0) return step;
  return { status: 'failed', error: problems.join('; '), result: step.result };
}

export function buildReport(job: string, steps: Record<string, StepResult>): CronReport {
  const names = Object.keys(steps);
  const failedSteps = names.filter((n) => steps[n].status === 'failed');
  return {
    job,
    ok: failedSteps.length === 0,
    ranSteps: names.filter((n) => steps[n].status === 'ran'),
    skippedSteps: names.filter((n) => steps[n].status === 'skipped'),
    failedSteps,
    steps,
  };
}

/** 500 when any step failed, so the scheduler and monitors see it. */
export function reportHttpStatus(report: Pick<CronReport, 'failedSteps'>): 200 | 500 {
  return report.failedSteps.length > 0 ? 500 : 200;
}
