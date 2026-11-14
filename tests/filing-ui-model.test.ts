import { describe, expect, it } from 'vitest';
import {
  ONE_CLICK_AGENT_NOTE,
  ONE_CLICK_AGENT_TITLE,
  ONE_CLICK_FILED_LABEL,
  ONE_CLICK_LANE_REASONS,
  ONE_CLICK_SELF_FILE_NOTE,
  ONE_CLICK_SELF_FILE_TITLE,
  ONE_CLICK_TIMING,
} from '@/lib/copy';
import { FRESH_SIGN_IN_METHODS, REAUTH_MAX_AGE_SECONDS, type ClaimFilingSummary } from '@/lib/filing/v2/contract';
import {
  claimPageNote,
  claimViewFromFiling,
  filingPath,
  filingStatusDisplay,
  formatEventTime,
  hasOneClickHistory,
  isIntakeStatus,
  isOneClickStatus,
  laneReasonLines,
  laneTiming,
  laneTitle,
  lastDayLine,
  oneClickSummaries,
  packetLegalName,
  signReadiness,
  summaryCounts,
  timelineRows,
  typedNameMatches,
} from '@/components/filing/filing-model';
import { hasFreshSignIn, sessionHasFreshSignIn } from '@/components/filing/fresh-sign-in';
import { CLAIM_ID, DESK_LANE, LAWSUIT_ID, SELF_FILE_LANE, filingView, readyView } from './filing-ui-fixtures';

describe('statuses', () => {
  it('knows which statuses are one-click and which are intake', () => {
    for (const s of ['preparing', 'ready', 'signed', 'queued', 'filing', 'filed_by_claimmatch', 'needs_you', 'filing_rejected']) {
      expect(isOneClickStatus(s)).toBe(true);
    }
    for (const s of ['self_file', 'reported_filed', 'submitted', 'withdrawn', 'not_reported_filed', '', null, undefined]) {
      expect(isOneClickStatus(s)).toBe(false);
    }
    expect(['preparing', 'ready', 'needs_you'].every(isIntakeStatus)).toBe(true);
    expect(['signed', 'queued', 'filing'].some(isIntakeStatus)).toBe(false);
  });

  it('labels every status, and filed_by_claimmatch never reads "Submitted"', () => {
    expect(filingStatusDisplay('preparing', null)).toMatchObject({ label: 'Preparing your claim', tone: 'amber' });
    expect(filingStatusDisplay('ready', null).label).toBe('Ready to file');
    expect(filingStatusDisplay('queued', null).label).toBe('In line to be filed');
    expect(filingStatusDisplay('filing', null).label).toBe('Filing in progress');
    const filed = filingStatusDisplay('filed_by_claimmatch', null);
    expect(filed.label).toBe(ONE_CLICK_FILED_LABEL);
    expect(filed.label).not.toMatch(/submitted/i);
    expect(filingStatusDisplay('submitted', ' #CM-123 ').label).toBe('Submitted · #CM-123');
    expect(filingStatusDisplay('needs_you', null).tone).toBe('red');
    expect(filingStatusDisplay('filing_rejected', null).label).toBe('Not accepted by the administrator');
    expect(filingStatusDisplay('withdrawn', null).label).toBe('Withdrawn by you');
    expect(filingStatusDisplay('something_new', null)).toMatchObject({ label: 'Status updated', tone: 'gray', detail: null });
  });
});

describe('lane copy', () => {
  it('says "Lawsuit AI files this claim for you" only on an agent lane', () => {
    expect(laneTitle(DESK_LANE)).toBe(ONE_CLICK_AGENT_TITLE);
    expect(laneTitle(SELF_FILE_LANE)).toBe(ONE_CLICK_SELF_FILE_TITLE);
    expect(laneTitle(null)).toBe(ONE_CLICK_SELF_FILE_TITLE);
    // A malformed view (agent true on self_file) still never claims Lawsuit AI files it.
    expect(laneTitle({ ...SELF_FILE_LANE, agent: true })).toBe(ONE_CLICK_SELF_FILE_TITLE);
  });

  it('gives each channel its own timing, and none on self_file', () => {
    for (const lane of ['filing_desk', 'administrator_email', 'administrator_bulk', 'administrator_api'] as const) {
      expect(laneTiming({ ...DESK_LANE, lane })).toBe(ONE_CLICK_TIMING[lane]);
    }
    expect(laneTiming(SELF_FILE_LANE)).toBeNull();
    expect(laneTiming(null)).toBeNull();
  });

  it('turns member reasons into plain sentences, once each, only off the agent lanes', () => {
    expect(laneReasonLines({ ...SELF_FILE_LANE, reasons: ['state_not_covered', 'state_not_covered', 'deadline_too_close'] })).toEqual([
      ONE_CLICK_LANE_REASONS.state_not_covered,
      ONE_CLICK_LANE_REASONS.deadline_too_close,
    ]);
    expect(laneReasonLines(DESK_LANE)).toEqual([]);
    for (const text of Object.values(ONE_CLICK_LANE_REASONS)) {
      expect(text).not.toMatch(/kill|objection|capacity|staff|dispute/i);
    }
  });

  it('warns when to sign by on agent lanes with a cutoff', () => {
    expect(lastDayLine(DESK_LANE)).toBe('Sign by Dec 10, 2026 so there is time to file it before the deadline.');
    expect(lastDayLine({ ...DESK_LANE, last_day_for_agent: null })).toBeNull();
    expect(lastDayLine(SELF_FILE_LANE)).toBeNull();
  });

  it('picks the claim page note by status and lane', () => {
    expect(claimPageNote({ status: 'preparing', lane: DESK_LANE, offerStart: false })).toBe(ONE_CLICK_AGENT_NOTE);
    expect(claimPageNote({ status: 'preparing', lane: SELF_FILE_LANE, offerStart: false })).toBe(ONE_CLICK_SELF_FILE_NOTE);
    expect(claimPageNote({ status: 'queued', lane: SELF_FILE_LANE, offerStart: false })).toBe(ONE_CLICK_AGENT_NOTE);
    expect(claimPageNote({ status: null, lane: DESK_LANE, offerStart: true })).toBe(ONE_CLICK_AGENT_NOTE);
    expect(claimPageNote({ status: null, lane: DESK_LANE, offerStart: false })).toBe(ONE_CLICK_SELF_FILE_NOTE);
    expect(claimPageNote({ status: 'self_file', lane: null, offerStart: false })).toBe(ONE_CLICK_SELF_FILE_NOTE);
    expect(claimPageNote({ status: 'filing_rejected', lane: DESK_LANE, offerStart: false })).toBe(ONE_CLICK_SELF_FILE_NOTE);
  });
});

describe('status path and timeline', () => {
  it('places the claim on the path; needs_you sits at preparing; off-path statuses have none', () => {
    const at = (status: string) => filingPath(status)?.map((s) => `${s.status}:${s.state}`);
    expect(at('preparing')?.slice(0, 2)).toEqual(['preparing:current', 'ready:upcoming']);
    expect(at('needs_you')?.[0]).toBe('preparing:current');
    expect(at('filed_by_claimmatch')).toEqual([
      'preparing:done',
      'ready:done',
      'signed:done',
      'queued:done',
      'filing:done',
      'filed_by_claimmatch:current',
      'submitted:upcoming',
    ]);
    expect(at('submitted')?.every((s) => s.endsWith(':done'))).toBe(true);
    expect(filingPath('withdrawn')).toBeNull();
    expect(filingPath('filing_rejected')).toBeNull();
  });

  it('shows who did what and when, in Eastern time, never naming staff', () => {
    const rows = timelineRows([
      { at: '2026-11-12T14:00:00Z', status: 'signed', from: 'ready', actor: 'you', action: 'sign', confirmation_number: null },
      { at: '2026-11-13T15:30:00Z', status: 'filed_by_claimmatch', from: 'filing', actor: 'claimmatch', action: null, confirmation_number: null },
      { at: '2026-11-20T15:30:00Z', status: 'submitted', from: 'filed_by_claimmatch', actor: 'claimmatch', action: null, confirmation_number: '#ABC-1' },
      { at: '2026-11-21T15:30:00Z', status: 'mystery', from: null, actor: 'claimmatch', action: null, confirmation_number: null },
    ]);
    expect(rows.map((r) => [r.actor, r.text, r.confirmation])).toEqual([
      ['You', 'Signed the claim', null],
      ['Lawsuit AI', 'Filed with the settlement administrator', null],
      ['Lawsuit AI', 'Confirmation number received', 'ABC-1'],
      ['Lawsuit AI', 'Status updated', null],
    ]);
    expect(rows[0].when).toBe('Nov 12, 2026, 9:00 AM ET');
    expect(rows[0].at).toBe('2026-11-12T14:00:00Z');
    expect(formatEventTime('not a date')).toBe('');
  });

  it('knows when a claim went through one-click', () => {
    expect(hasOneClickHistory(null)).toBe(false);
    expect(hasOneClickHistory(filingView({ status: 'self_file', timeline: [] }))).toBe(false);
    expect(hasOneClickHistory(filingView({ status: 'self_file' }))).toBe(true);
  });

  it('keeps ClaimFlow’s claim in step with the filing view', () => {
    const view = filingView({ status: 'queued' });
    const next = claimViewFromFiling(view, null);
    expect(next).toMatchObject({ id: CLAIM_ID, lawsuit_id: LAWSUIT_ID, status: 'queued', lawsuit_title: 'Widget settlement' });
    const kept = claimViewFromFiling(view, { ...next, lawsuit_title: 'Kept', created_at: '2026-01-01T00:00:00Z', status: 'ready' });
    expect(kept).toMatchObject({ lawsuit_title: 'Kept', created_at: '2026-01-01T00:00:00Z', status: 'queued' });
  });
});

describe('signing', () => {
  it('compares the typed name like the server (normalizeTypedName)', () => {
    expect(typedNameMatches('  ada   LOVELACE ', 'Ada Lovelace')).toBe(true);
    expect(typedNameMatches('Ada', 'Ada Lovelace')).toBe(false);
    expect(typedNameMatches('Ada Lovelace', null)).toBe(false);
    expect(typedNameMatches('Zoé Smith', 'Zoé Smith')).toBe(true);
    expect(packetLegalName(readyView().packet)).toBe('Ada Lovelace');
    expect(packetLegalName(null)).toBeNull();
  });

  it('allows "File my claim" only when the server does and the packet is complete on an agent lane', () => {
    expect(signReadiness(readyView()).canSign).toBe(true);
    expect(signReadiness(readyView({ actions: { can_sign: false } })).canSign).toBe(false);
    expect(signReadiness(readyView({ packet: { packet_hash: null } })).canSign).toBe(false);
    expect(signReadiness(readyView({ lane: SELF_FILE_LANE })).canSign).toBe(false);
    const preparing = signReadiness(filingView());
    expect(preparing.canSign).toBe(false);
    expect(preparing.missing.map((i) => i.path)).toEqual([
      'member.address.zip',
      'answers.widget_count',
      'payout_method',
      'documents.receipt',
    ]);
  });

  it('lists each blocking issue once', () => {
    const block = { rule_id: 'kroger.max', source: 'settlement' as const, severity: 'block' as const, code: 'rule_failed', message: 'Too many.', field: 'answers.widget_count' };
    const view = filingView({ packet: { jev: { mode: 'partial', outcome: 'block', evaluated_at: '2026-11-12T15:00:00Z', issues: [block] } } });
    view.packet!.items[6].issues = [block];
    expect(signReadiness(view).blocking).toEqual([block]);
  });
});

describe('dashboard summaries', () => {
  const summary = (status: string): ClaimFilingSummary => ({
    claim_id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    slug: 'widget-settlement',
    title: 'Widget settlement',
    status,
    lane: 'filing_desk',
    agent: true,
    deadline: '2026-12-15',
    confirmation_number: null,
    needs_action: status === 'ready',
    updated_at: '2026-11-12T15:00:00Z',
  });

  it('keeps one-click claims and counts the ready ones', () => {
    const items = ['ready', 'ready', 'queued', 'needs_you', 'self_file', 'submitted'].map(summary);
    const mine = oneClickSummaries(items);
    expect(mine.map((i) => i.status)).toEqual(['ready', 'ready', 'queued', 'needs_you']);
    expect(summaryCounts(mine)).toEqual({ ready: 2, needsYou: 1 });
  });
});

describe('fresh sign-in', () => {
  const now = new Date('2026-11-12T15:00:00Z');
  const seconds = Math.floor(now.getTime() / 1000);
  const claims = (amr: unknown, sub = 'user-a') => ({ sub, amr });
  const fresh = (amr: unknown, sub?: string) => hasFreshSignIn(claims(amr, sub), 'user-a', now);

  it('counts a password or MFA sign-in from the last 15 minutes only', () => {
    expect(fresh([{ method: 'password', timestamp: seconds - 60 }])).toBe(true);
    expect(fresh([{ method: 'mfa/totp', timestamp: seconds - REAUTH_MAX_AGE_SECONDS }])).toBe(true);
    expect(fresh([{ method: 'password', timestamp: seconds - REAUTH_MAX_AGE_SECONDS - 1 }])).toBe(false);
    for (const method of FRESH_SIGN_IN_METHODS) expect(fresh([{ method, timestamp: seconds }])).toBe(true);
    // A little clock skew is fine; a stamp far in the future is not.
    expect(fresh([{ method: 'password', timestamp: seconds + 120 }])).toBe(true);
    expect(fresh([{ method: 'password', timestamp: seconds + 3600 }])).toBe(false);
  });

  it('never counts email links, string-only amr, another user’s token, or nonsense', () => {
    for (const method of ['otp', 'magiclink', 'recovery', 'invite', 'email/signup']) {
      expect(fresh([{ method, timestamp: seconds }])).toBe(false);
    }
    expect(fresh(['password'])).toBe(false);
    expect(fresh([{ method: 'password', timestamp: String(seconds) }])).toBe(false);
    expect(fresh([{ method: 'password', timestamp: seconds }], 'user-b')).toBe(false);
    expect(hasFreshSignIn(null, 'user-a', now)).toBe(false);
    expect(hasFreshSignIn({ sub: 'user-a', amr: 'password' }, 'user-a', now)).toBe(false);
  });

  it('reads the session’s verified claims and fails closed', async () => {
    const client = (result: unknown) => ({ auth: { getClaims: async () => result } }) as never;
    const ok = (amr: unknown) => client({ data: { claims: claims(amr) }, error: null });
    expect(await sessionHasFreshSignIn(ok([{ method: 'password', timestamp: seconds }]), 'user-a', now)).toBe(true);
    expect(await sessionHasFreshSignIn(ok([{ method: 'magiclink', timestamp: seconds }]), 'user-a', now)).toBe(false);
    expect(await sessionHasFreshSignIn(client({ data: null, error: { message: 'bad jwt' } }), 'user-a', now)).toBe(false);
    const throwing = { auth: { getClaims: async () => { throw new Error('down'); } } } as never;
    expect(await sessionHasFreshSignIn(throwing, 'user-a', now)).toBe(false);
  });
});
