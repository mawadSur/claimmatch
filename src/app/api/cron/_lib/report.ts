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

export const D50_PAUSED = 'paused (D50)';

export type StepResult =
  | { status: 'ran'; result: unknown }
  | { status: 'skipped'; reason: string; resume?: string }
  | { status: 'failed'; error: string };

export interface CronReport {
  job: string;
  /** False when any step failed. */
  ok: boolean;
  ran: string[];
  skipped: string[];
  failed: string[];
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

export function buildReport(job: string, steps: Record<string, StepResult>): CronReport {
  const names = Object.keys(steps);
  const failed = names.filter((n) => steps[n].status === 'failed');
  return {
    job,
    ok: failed.length === 0,
    ran: names.filter((n) => steps[n].status === 'ran'),
    skipped: names.filter((n) => steps[n].status === 'skipped'),
    failed,
    steps,
  };
}

/** 500 when any step failed, so the scheduler and monitors see it. */
export function reportHttpStatus(report: Pick<CronReport, 'failed'>): 200 | 500 {
  return report.failed.length > 0 ? 500 : 200;
}
