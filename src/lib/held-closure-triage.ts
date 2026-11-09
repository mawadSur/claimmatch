/**
 * Suggested decisions for circuit-breaker held closures, plus the official-site
 * probe that feeds them. Suggestions are never applied on their own: an admin
 * still approves. Official-site checks run from cron only (rate-limited and
 * time-boxed) — never from a user-facing request.
 */
import { isDeadlinePassed } from '@/lib/utils';
import { guidedDeadline } from '@/lib/settlement-guides';
import type { PlannedUpdate } from '@/lib/scraper/plan';

export const HELD_SITE_CHECK_TIMEOUT_MS = 6_000;
export const HELD_SITE_CHECK_GAP_MS = 400;
export const HELD_SITE_CHECK_MAX_PER_RUN = 25;
export const HELD_SITE_CHECK_BUDGET_MS = 40_000;
export const HELD_SITE_CHECK_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export const HELD_SITE_CHECK_BODY_LIMIT = 64_000;
export const HELD_SITE_CHECK_USER_AGENT = 'ClaimMatchHeldCheck/1.0 (+https://lawsuitai.org)';

export type HeldClosureSuggestion = 'safe_to_close' | 'likely_close' | 'likely_keep' | 'unknown';

export type HeldSiteSignal = 'gone' | 'claims_closed' | 'still_open' | 'timeout' | 'error' | 'unknown';

export interface HeldSiteCheck {
  slug: string;
  http_status: number | null;
  signal: HeldSiteSignal;
  checked_at: string;
}

export interface HeldTriageInput {
  deadline: string | null;
  site?: Pick<HeldSiteCheck, 'http_status' | 'signal'> | null;
}

export interface HeldTriageResult {
  suggestion: HeldClosureSuggestion;
  evidence: string[];
}

const CLOSED_COPY = [
  /claims?\s+(are|is|have been)\s+closed/i,
  /claim\s+period\s+has\s+(ended|closed|expired)/i,
  /no longer accepting\s+(claims?|filings?)/i,
  /filing deadline has (passed|expired)/i,
  /this settlement is closed/i,
  /claims?\s+(filing\s+)?deadline has (passed|expired)/i,
  /the (online )?claim (form|portal|site) (is|has been) closed/i,
];

const OPEN_COPY = [
  /file (a|your) claim/i,
  /submit (a|your) claim/i,
  /claim form/i,
  /start (a|your) claim/i,
  /file your claim/i,
];

export function classifyHeldSiteBody(body: string): 'claims_closed' | 'still_open' | null {
  const text = body.slice(0, HELD_SITE_CHECK_BODY_LIMIT);
  const closed = CLOSED_COPY.some((re) => re.test(text));
  const open = OPEN_COPY.some((re) => re.test(text));
  if (closed && !open) return 'claims_closed';
  if (open) return 'still_open';
  return null;
}

export function classifyHeldSiteHttp(status: number | null): 'gone' | null {
  return status === 404 || status === 410 ? 'gone' : null;
}

/**
 * Deadline first (past → safe to close). Then official-site signals. A future
 * deadline with no close signal is likely keep. No deadline and no site check
 * is unknown.
 */
export function suggestHeldClosureDecision(
  input: HeldTriageInput,
  now: Date = new Date(),
): HeldTriageResult {
  const evidence: string[] = [];
  const deadline = input.deadline;
  const site = input.site ?? null;

  if (deadline && isDeadlinePassed(deadline, now)) {
    evidence.push(`Listed deadline ${deadline} has passed.`);
    return { suggestion: 'safe_to_close', evidence };
  }

  if (site) {
    if (site.signal === 'gone' || classifyHeldSiteHttp(site.http_status)) {
      evidence.push(
        site.http_status
          ? `Official claim site returned ${site.http_status}.`
          : 'Official claim site is gone (404 or 410).',
      );
      return { suggestion: 'likely_close', evidence };
    }
    if (site.signal === 'claims_closed') {
      evidence.push('Official claim site says claims are closed.');
      return { suggestion: 'likely_close', evidence };
    }
    if (site.signal === 'still_open') {
      evidence.push('Official claim site still lists a way to file.');
      if (deadline) evidence.push(`Listed deadline ${deadline} is still ahead.`);
      return { suggestion: 'likely_keep', evidence };
    }
  }

  if (deadline && !isDeadlinePassed(deadline, now)) {
    evidence.push(`Listed deadline ${deadline} is still ahead.`);
    if (!site) evidence.push('Official site has not been checked yet.');
    return { suggestion: 'likely_keep', evidence };
  }

  if (!deadline && !site) {
    evidence.push('No deadline on file and the official site has not been checked.');
  } else if (site?.signal === 'timeout') {
    evidence.push('Official site check timed out.');
  } else if (site?.signal === 'error') {
    evidence.push('Official site check failed.');
  } else {
    evidence.push('Not enough evidence to suggest close or keep.');
  }
  return { suggestion: 'unknown', evidence };
}

export function groupHeldClosureSuggestions<T extends { suggestion: HeldClosureSuggestion }>(
  items: T[],
): Record<HeldClosureSuggestion, T[]> {
  const groups: Record<HeldClosureSuggestion, T[]> = {
    safe_to_close: [],
    likely_close: [],
    likely_keep: [],
    unknown: [],
  };
  for (const item of items) groups[item.suggestion].push(item);
  return groups;
}

export const HELD_TRIAGE_GROUP_ORDER: HeldClosureSuggestion[] = [
  'safe_to_close',
  'likely_close',
  'likely_keep',
  'unknown',
];

export function heldTriageGroupLabel(group: HeldClosureSuggestion): string {
  switch (group) {
    case 'safe_to_close':
      return 'Safe to close';
    case 'likely_close':
      return 'Likely close';
    case 'likely_keep':
      return 'Likely keep';
    case 'unknown':
      return 'Unknown';
  }
}

export function heldTriageGroupHint(group: HeldClosureSuggestion): string {
  switch (group) {
    case 'safe_to_close':
      return 'The listed deadline has already passed.';
    case 'likely_close':
      return 'The official claim site is gone or says claims are closed.';
    case 'likely_keep':
      return 'The official site still lists a claim path, or the deadline is still ahead.';
    case 'unknown':
      return 'Not enough stored evidence to suggest close or keep.';
  }
}

/**
 * Held closes whose *stored* catalog deadline is already past (for a guided
 * settlement, its official deadline: guidedDeadline). The ingest flag may
 * apply these without a person; everything else stays held.
 */
export function partitionHeldPastDeadline<T extends PlannedUpdate>(
  held: T[],
  extrasById: Map<string, { deadline: string | null }>,
  now: Date,
): { autoClose: T[]; remainHeld: T[] } {
  const autoClose: T[] = [];
  const remainHeld: T[] = [];
  for (const row of held) {
    const deadline = guidedDeadline({ slug: row.slug, deadline: extrasById.get(row.id)?.deadline ?? null });
    if (deadline && isDeadlinePassed(deadline, now)) autoClose.push(row);
    else remainHeld.push(row);
  }
  return { autoClose, remainHeld };
}

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message) : '';
  return name === 'AbortError' || /timeout|aborted/i.test(message);
}

export async function probeHeldOfficialUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = HELD_SITE_CHECK_TIMEOUT_MS,
): Promise<{ http_status: number | null; signal: HeldSiteSignal }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { http_status: null, signal: 'error' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { http_status: null, signal: 'error' };
  }

  const headers = { 'user-agent': HELD_SITE_CHECK_USER_AGENT, accept: 'text/html, */*;q=0.8' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(parsed.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const gone = classifyHeldSiteHttp(res.status);
    if (gone) return { http_status: res.status, signal: gone };
    let body = '';
    try {
      body = (await res.text()).slice(0, HELD_SITE_CHECK_BODY_LIMIT);
    } catch {
      body = '';
    }
    const fromBody = classifyHeldSiteBody(body);
    return { http_status: res.status, signal: fromBody ?? 'unknown' };
  } catch (err) {
    if (isTimeout(err)) return { http_status: null, signal: 'timeout' };
    return { http_status: null, signal: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export function needsHeldSiteCheck(
  row: { officialHref: string | null; checked_at: string | null },
  now: Date,
  staleMs = HELD_SITE_CHECK_STALE_MS,
): boolean {
  if (!row.checked_at) return true;
  const at = Date.parse(row.checked_at);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= staleMs;
}

