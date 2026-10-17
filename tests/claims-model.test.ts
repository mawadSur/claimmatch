import { describe, expect, it } from 'vitest';
import {
  CLAIM_STATUSES,
  allowedNextStatuses,
  canReportWithoutClaim,
  claimActionAvailability,
  daysUntilDeadline,
  deadlineCountdown,
  deadlineCutoff,
  displayClaimStatus,
  isDeadlinePassed,
  isLateReportWindowOpen,
  isLegacyClaim,
  isOpenForClaims,
  lateReportLastDay,
  legacyAnswerCopy,
  legacyFilingState,
  needsCorrectiveNotice,
  planClaimTransition,
  reportByDay,
  settlementContext,
  type ClaimAction,
  type ClaimFields,
  type SettlementContext,
  type SettlementFacts,
} from '@/lib/claims';
import { isFictionalSettlementSlug } from '@/lib/claims-server';

const NOW = new Date('2026-10-16T18:00:00Z');
const notFictional = () => false;
const fictionalSlugs = (slug: string) => slug === 'fake-olive-oil';

function settlement(overrides: Partial<SettlementFacts> = {}): SettlementFacts {
  return { slug: 'real-settlement', status: 'open', review_status: 'published', deadline: '2026-11-30', ...overrides };
}
function ctx(
  overrides: Partial<SettlementFacts> = {},
  isFictional: (slug: string) => boolean = notFictional,
  now: Date = NOW,
): SettlementContext {
  return settlementContext(settlement(overrides), now, isFictional);
}
const OPEN = ctx();
const PAST_10_DAYS = ctx({ deadline: '2026-10-06' });
const PAST_60_DAYS = ctx({ deadline: '2026-08-17' });
const FICTIONAL = ctx({ slug: 'fake-olive-oil', review_status: 'rejected' }, fictionalSlugs);

describe('deadlines (open through 23:59:59 Pacific/Honolulu)', () => {
  it('cuts off at the end of the day in Honolulu (the shared catalog cutoff)', () => {
    // deadlineCutoff is the catalog's: the first instant the deadline has passed.
    expect(deadlineCutoff('2026-11-30')?.toISOString()).toBe('2026-12-01T10:00:00.000Z');
    expect(isDeadlinePassed('2026-11-30', new Date('2026-12-01T09:59:59.999Z'))).toBe(false);
    expect(isDeadlinePassed('2026-11-30', new Date('2026-12-01T10:00:00.000Z'))).toBe(true);
  });

  it('never overstates the days left, with 0 on the last day', () => {
    expect(daysUntilDeadline('2026-11-30', new Date('2026-11-30T20:00:00Z'))).toBe(0);
    // 04:00 on Nov 30 in New York (still Nov 29 in Honolulu): already the last day for most people.
    expect(daysUntilDeadline('2026-11-30', new Date('2026-11-30T09:00:00Z'))).toBe(0);
    expect(daysUntilDeadline('2026-11-30', new Date('2026-11-29T20:00:00Z'))).toBe(1);
    // Still open late on Nov 30 in Honolulu.
    expect(daysUntilDeadline('2026-11-30', new Date('2026-12-01T09:59:00Z'))).toBe(0);
    expect(daysUntilDeadline('2026-11-30', new Date('2026-12-01T10:00:00Z'))).toBe(-1);
    expect(deadlineCountdown('2026-11-30', new Date('2026-11-30T20:00:00Z'))).toBe('Last day is today');
    expect(deadlineCountdown('2026-11-30', new Date('2026-11-30T09:00:00Z'))).toBe('Last day is today');
    expect(deadlineCountdown('2026-11-30', new Date('2026-11-29T20:00:00Z'))).toBe('1 day left');
    expect(deadlineCountdown('2026-11-30', NOW)).toBe('45 days left');
    expect(deadlineCountdown('2026-10-01', NOW)).toBe('Deadline passed');
  });

  it('treats missing or impossible dates as no deadline', () => {
    expect(deadlineCutoff(null)).toBeNull();
    expect(deadlineCutoff('2026-02-30')).toBeNull();
    expect(deadlineCutoff('soon')).toBeNull();
    expect(isDeadlinePassed('2026-02-30', NOW)).toBe(false);
    expect(deadlineCountdown(null, NOW)).toBeNull();
  });

  it('accepts late reports until 30 days after the deadline', () => {
    expect(lateReportLastDay('2026-11-30')).toBe('2026-12-30');
    expect(isLateReportWindowOpen('2026-11-30', new Date('2026-12-31T09:59:00Z'))).toBe(true);
    expect(isLateReportWindowOpen('2026-11-30', new Date('2026-12-31T10:00:01Z'))).toBe(false);
    expect(isLateReportWindowOpen(null, NOW)).toBe(true);
  });
});

describe('open-for-claims rule', () => {
  it('is the shared rule: published, real, open or closing soon, deadline not passed', () => {
    expect(isOpenForClaims(settlement(), NOW)).toBe(true);
    expect(isOpenForClaims(settlement({ status: 'closing_soon' }), NOW)).toBe(true);
    expect(isOpenForClaims(settlement({ deadline: null }), NOW)).toBe(true);
    expect(isOpenForClaims(settlement({ review_status: 'pending_review' }), NOW)).toBe(false);
    expect(isOpenForClaims(settlement({ review_status: 'rejected' }), NOW)).toBe(false);
    expect(isOpenForClaims(settlement({ status: 'closed' }), NOW)).toBe(false);
    expect(isOpenForClaims(settlement({ status: 'draft' }), NOW)).toBe(false);
    expect(isOpenForClaims(settlement({ deadline: '2026-10-15' }), NOW)).toBe(false);
    // One of the 22 fictional settlements (src/lib/fictional-slugs.ts).
    expect(isOpenForClaims(settlement({ slug: 'robocall-tcpa-settlement' }), NOW)).toBe(false);
  });

  it('marks claims on the fictional settlements as fictional and never open', () => {
    const real = ctx({ slug: 'robocall-tcpa-settlement' }, isFictionalSettlementSlug);
    expect(real).toMatchObject({ fictional: true, openForClaims: false, lateReportOpen: false });
    expect(ctx({}, isFictionalSettlementSlug)).toMatchObject({ fictional: false, openForClaims: true });
  });

  it('builds the context the claim flow uses', () => {
    expect(OPEN).toMatchObject({ known: true, openForClaims: true, deadlinePassed: false, lateReportOpen: true });
    expect(PAST_10_DAYS).toMatchObject({ openForClaims: false, deadlinePassed: true, lateReportOpen: true });
    expect(PAST_60_DAYS).toMatchObject({ deadlinePassed: true, lateReportOpen: false });
    expect(FICTIONAL).toMatchObject({ fictional: true, openForClaims: false, lateReportOpen: false });
    expect(settlementContext(null, NOW, notFictional)).toMatchObject({ known: false, lateReportOpen: true });
  });
});

describe('reporting filing without a claim (WP:122, WP:141)', () => {
  // NOW is 2026-10-16 18:00 UTC (08:00 in Honolulu).
  const DAY_AFTER = ctx({ deadline: '2026-10-15' });
  const DAY_30 = ctx({ deadline: '2026-09-16' }); // the last day to report is today
  const DAY_31 = ctx({ deadline: '2026-09-15' });

  it('stays possible for 30 days after the deadline, after saving is no longer possible', () => {
    expect(OPEN).toMatchObject({ openForClaims: true });
    expect(canReportWithoutClaim(OPEN)).toBe(true);
    expect(DAY_AFTER).toMatchObject({ openForClaims: false, deadlinePassed: true });
    expect(canReportWithoutClaim(DAY_AFTER)).toBe(true);
    expect(canReportWithoutClaim(DAY_30)).toBe(true);
    expect(canReportWithoutClaim(DAY_31)).toBe(false);
    // The window ends with the last day in Honolulu.
    const deadline = { deadline: '2026-09-15' };
    expect(canReportWithoutClaim(ctx(deadline, notFictional, new Date('2026-10-16T09:59:59Z')))).toBe(true);
    expect(canReportWithoutClaim(ctx(deadline, notFictional, new Date('2026-10-16T10:00:00Z')))).toBe(false);
  });

  it('stays possible on a listing our list marks closed while it is re-checked (D41)', () => {
    const closed = ctx({ status: 'closed' });
    expect(closed).toMatchObject({ openForClaims: false, closedByStatus: true, deadlinePassed: false });
    expect(canReportWithoutClaim(closed)).toBe(true);
    expect(canReportWithoutClaim(ctx({ status: 'closed', deadline: null }))).toBe(true);
    expect(canReportWithoutClaim(ctx({ status: 'closed', deadline: '2026-09-15' }))).toBe(false);
  });

  it('is never possible on a fictional, unpublished or unknown settlement', () => {
    expect(canReportWithoutClaim(FICTIONAL)).toBe(false);
    expect(canReportWithoutClaim(ctx({ slug: 'robocall-tcpa-settlement' }, isFictionalSettlementSlug))).toBe(false);
    expect(canReportWithoutClaim(ctx({ review_status: 'rejected' }))).toBe(false);
    expect(canReportWithoutClaim(ctx({ review_status: 'pending_review', deadline: '2026-10-15' }))).toBe(false);
    expect(canReportWithoutClaim(settlementContext(null, NOW, notFictional))).toBe(false);
  });

  it('matches what the new claim then accepts: the report the day after, nothing on day 31', () => {
    // POST /api/claims creates the claim in self_file, then the report is a PATCH.
    const fresh: ClaimFields = { status: 'self_file' };
    for (const context of [DAY_AFTER, DAY_30, ctx({ status: 'closed' })]) {
      expect(claimActionAvailability(fresh, context).reportFiled).toBe(true);
      const result = planClaimTransition(fresh, { action: 'report_filed', confirmation_number: 'AB-123' }, context, NOW);
      expect(result).toMatchObject({ ok: true, noop: false, plan: { toStatus: 'submitted' } });
    }
    expect(planClaimTransition(fresh, { action: 'report_filed' }, DAY_31, NOW)).toMatchObject({
      ok: false,
      refusal: 'window_closed',
    });
  });
});

describe('displayClaimStatus', () => {
  const label = (claim: ClaimFields, c?: SettlementContext) => displayClaimStatus(claim, c).label;

  it('labels the Part A states', () => {
    expect(label({ status: 'self_file' }, OPEN)).toBe('Not filed yet');
    expect(label({ status: 'reported_filed' }, OPEN)).toBe('Reported filed by you');
    expect(label({ status: 'submitted', confirmation_number: 'ABC-123' }, OPEN)).toBe('Submitted · #ABC-123');
    expect(label({ status: 'submitted', confirmation_number: '#4471' }, OPEN)).toBe('Submitted · #4471');
    expect(label({ status: 'not_reported_filed' }, OPEN)).toBe('Not reported filed');
    expect(label({ status: 'withdrawn' }, OPEN)).toBe('Withdrawn by you');
  });

  it('never shows a legacy claim as submitted', () => {
    for (const legacy of [
      { status: 'submitted' },
      { status: 'submitted', confirmation_number: null },
      { status: 'submitted', confirmation_number: '   ' },
      { status: 'processing' },
    ]) {
      const d = displayClaimStatus(legacy, OPEN);
      expect(d.label).toBe('Not filed');
      expect(d.legacy).toBe(true);
      expect(d.showNotice).toBe(true);
      expect(d.group).toBe('needs_filing');
    }
    for (const status of ['approved', 'rejected', 'paid']) {
      expect(label({ status }, OPEN)).toBe('Status not confirmed');
    }
  });

  it('works without 0006 columns or a settlement', () => {
    expect(label({ status: 'submitted' })).toBe('Not filed');
    expect(label({ status: 'self_file' })).toBe('Not filed yet');
  });

  it('says "Not reported filed" after the deadline, never "Expired"', () => {
    expect(displayClaimStatus({ status: 'self_file' }, PAST_10_DAYS)).toMatchObject({
      label: 'Not reported filed',
      group: 'closed',
    });
    expect(displayClaimStatus({ status: 'submitted' }, PAST_10_DAYS)).toMatchObject({
      label: 'Not filed',
      group: 'closed',
      showNotice: true,
    });
  });

  it('gives unknown values a neutral label', () => {
    expect(displayClaimStatus({ status: 'under_review' }, OPEN)).toMatchObject({
      label: 'Status unavailable',
      group: 'other',
    });
  });

  it('marks claims on fictional settlements as not real', () => {
    expect(displayClaimStatus({ status: 'submitted' }, FICTIONAL)).toMatchObject({
      kind: 'fictional',
      label: 'Not a real settlement',
      group: 'closed',
      showNotice: true,
    });
    expect(
      displayClaimStatus({ status: 'withdrawn', corrective_notice_answered_at: NOW.toISOString() }, FICTIONAL)
        .showNotice,
    ).toBe(false);
  });

  it('uses no banned wording on any label', () => {
    const banned = /expired|receipt|matched|owed|%|\$|we file|on your behalf|contingency/i;
    for (const status of [...CLAIM_STATUSES, 'mystery']) {
      for (const c of [OPEN, PAST_10_DAYS, FICTIONAL, undefined]) {
        for (const number of [null, 'A-1']) {
          expect(label({ status, confirmation_number: number }, c)).not.toMatch(banned);
        }
      }
    }
  });
});

describe('planClaimTransition', () => {
  const plan = (claim: ClaimFields, action: ClaimAction, c: SettlementContext = OPEN) =>
    planClaimTransition(claim, action, c, NOW);
  function changes(claim: ClaimFields, action: ClaimAction, c: SettlementContext = OPEN) {
    const r = plan(claim, action, c);
    if (!r.ok || r.noop) throw new Error(`expected a change, got ${JSON.stringify(r)}`);
    return r.plan;
  }

  it('self_file -> reported_filed without a number', () => {
    const p = changes({ status: 'self_file' }, { action: 'report_filed', filed_on: '2026-10-15' });
    expect(p.toStatus).toBe('reported_filed');
    expect(p.changes).toMatchObject({
      status: 'reported_filed',
      confirmation_number: null,
      reported_filed_at: NOW.toISOString(),
      user_filed_on: '2026-10-15',
    });
  });

  it('self_file -> submitted only with a number', () => {
    const p = changes({ status: 'self_file' }, { action: 'report_filed', confirmation_number: 'XY-778' });
    expect(p.changes).toMatchObject({ status: 'submitted', confirmation_number: 'XY-778' });
  });

  it('reported_filed -> submitted when the number is added, or back to self_file on undo', () => {
    const add = changes({ status: 'reported_filed' }, { action: 'add_confirmation', confirmation_number: 'N-1' });
    expect(add.changes).toEqual({ status: 'submitted', confirmation_number: 'N-1' });
    const undo = changes(
      { status: 'reported_filed', reported_filed_at: '2026-10-10T00:00:00Z', user_filed_on: '2026-10-10' },
      { action: 'undo_report' },
    );
    expect(undo.changes).toEqual({
      status: 'self_file',
      confirmation_number: null,
      reported_filed_at: null,
      user_filed_on: null,
    });
  });

  it('submitted: the number can be corrected, not undone', () => {
    const fix = changes(
      { status: 'submitted', confirmation_number: 'OLD-1' },
      { action: 'add_confirmation', confirmation_number: 'NEW-2' },
    );
    expect(fix.toStatus).toBe('submitted');
    expect(fix.changes).toEqual({ confirmation_number: 'NEW-2' });
    expect(fix.detail).toMatchObject({ previous_confirmation_number: 'OLD-1' });
    expect(plan({ status: 'submitted', confirmation_number: 'OLD-1' }, { action: 'add_confirmation', confirmation_number: 'OLD-1' })).toEqual({ ok: true, noop: true });
    expect(plan({ status: 'submitted', confirmation_number: 'OLD-1' }, { action: 'undo_report' })).toMatchObject({
      ok: false,
      refusal: 'not_allowed',
    });
  });

  it('legacy not-filed -> self_file, reported_filed or submitted, recording the answer', () => {
    const legacy = { status: 'submitted', confirmation_number: null };
    const notYet = changes(legacy, { action: 'acknowledge_notice' });
    expect(notYet.changes).toEqual({ status: 'self_file', corrective_notice_answered_at: NOW.toISOString() });
    const filed = changes(legacy, { action: 'report_filed' });
    expect(filed.changes).toMatchObject({ status: 'reported_filed', corrective_notice_answered_at: NOW.toISOString() });
    const withNumber = changes({ status: 'processing' }, { action: 'report_filed', confirmation_number: 'C-55' });
    expect(withNumber.changes).toMatchObject({ status: 'submitted', confirmation_number: 'C-55' });
  });

  it('lets a legacy claim answer the notice even long after the deadline', () => {
    expect(plan({ status: 'submitted' }, { action: 'report_filed' }, PAST_60_DAYS)).toMatchObject({ ok: true, noop: false });
  });

  it('accepts a late "I filed it" for 30 days after the deadline', () => {
    expect(plan({ status: 'self_file' }, { action: 'report_filed' }, PAST_10_DAYS)).toMatchObject({ ok: true, noop: false });
    expect(plan({ status: 'not_reported_filed' }, { action: 'report_filed' }, PAST_10_DAYS)).toMatchObject({ ok: true });
    expect(plan({ status: 'self_file' }, { action: 'report_filed' }, PAST_60_DAYS)).toMatchObject({
      ok: false,
      refusal: 'window_closed',
    });
  });

  it('refuses everything but acknowledging on a fictional settlement', () => {
    expect(plan({ status: 'self_file' }, { action: 'report_filed' }, FICTIONAL)).toMatchObject({
      ok: false,
      refusal: 'fictional',
    });
    const ack = changes({ status: 'submitted' }, { action: 'acknowledge_notice' }, FICTIONAL);
    expect(ack.changes).toEqual({ status: 'withdrawn', corrective_notice_answered_at: NOW.toISOString() });
    expect(
      plan({ status: 'withdrawn', corrective_notice_answered_at: NOW.toISOString() }, { action: 'acknowledge_notice' }, FICTIONAL),
    ).toEqual({ ok: true, noop: true });
  });

  it('treats repeats as no-ops and refuses impossible moves', () => {
    expect(plan({ status: 'reported_filed' }, { action: 'report_filed' })).toEqual({ ok: true, noop: true });
    expect(changes({ status: 'reported_filed' }, { action: 'report_filed', confirmation_number: 'Z-9' }).changes).toMatchObject({
      status: 'submitted',
    });
    expect(plan({ status: 'self_file' }, { action: 'acknowledge_notice' })).toEqual({ ok: true, noop: true });
    expect(plan({ status: 'self_file' }, { action: 'undo_report' })).toEqual({ ok: true, noop: true });
    expect(plan({ status: 'withdrawn' }, { action: 'report_filed' })).toMatchObject({ ok: false, refusal: 'not_allowed' });
    expect(plan({ status: 'self_file' }, { action: 'add_confirmation', confirmation_number: 'A-1' })).toMatchObject({
      ok: false,
    });
    expect(plan({ status: 'under_review' }, { action: 'report_filed' })).toMatchObject({
      ok: false,
      refusal: 'unknown_status',
    });
  });

  it('withdraw (model only) follows WP:104-105', () => {
    expect(changes({ status: 'self_file' }, { action: 'withdraw' }).toStatus).toBe('withdrawn');
    expect(plan({ status: 'reported_filed' }, { action: 'withdraw' })).toMatchObject({ ok: false });
  });

  it('only ever plans allowed moves, and never "submitted" without a number', () => {
    const actions: ClaimAction[] = [
      { action: 'report_filed' },
      { action: 'report_filed', confirmation_number: 'R-1', filed_on: '2026-10-01' },
      { action: 'add_confirmation', confirmation_number: 'R-2' },
      { action: 'undo_report' },
      { action: 'acknowledge_notice' },
      { action: 'withdraw' },
    ];
    const claims: ClaimFields[] = [
      ...CLAIM_STATUSES.map((status) => ({ status })),
      { status: 'submitted', confirmation_number: 'HAS-1' },
      { status: 'submitted', corrective_notice_answered_at: NOW.toISOString() },
    ];
    for (const claim of claims) {
      for (const c of [OPEN, PAST_10_DAYS, PAST_60_DAYS, FICTIONAL, settlementContext(null, NOW, notFictional)]) {
        const allowed = allowedNextStatuses(claim, c);
        for (const action of actions) {
          const r = planClaimTransition(claim, action, c, NOW);
          if (!r.ok || r.noop) continue;
          const { toStatus, fromStatus, changes: ch } = r.plan;
          if (toStatus !== fromStatus) expect(allowed).toContain(toStatus);
          if (toStatus === 'submitted') {
            const number = ch.confirmation_number ?? claim.confirmation_number;
            expect(typeof number === 'string' && number.trim() !== '').toBe(true);
          }
        }
      }
    }
  });
});

describe('claimActionAvailability', () => {
  it('matches what the server accepts', () => {
    expect(claimActionAvailability({ status: 'self_file' }, OPEN)).toMatchObject({ reportFiled: true, undoReport: false });
    expect(claimActionAvailability({ status: 'reported_filed' }, OPEN)).toMatchObject({
      addConfirmation: true,
      undoReport: true,
      reportFiled: false,
    });
    expect(claimActionAvailability({ status: 'submitted', confirmation_number: 'X-1' }, OPEN)).toMatchObject({
      correctConfirmation: true,
      undoReport: false,
    });
    expect(claimActionAvailability({ status: 'submitted' }, OPEN)).toMatchObject({
      answerCorrectiveNotice: true,
      reportFiled: true,
      correctConfirmation: false,
    });
    expect(claimActionAvailability({ status: 'self_file' }, PAST_60_DAYS).reportFiled).toBe(false);
    expect(claimActionAvailability({ status: 'submitted' }, FICTIONAL)).toMatchObject({
      acknowledgeFictional: true,
      reportFiled: false,
    });
  });

  it('flags legacy rows', () => {
    expect(isLegacyClaim({ status: 'submitted' })).toBe(true);
    expect(isLegacyClaim({ status: 'submitted', confirmation_number: 'A-1' })).toBe(false);
    expect(isLegacyClaim({ status: 'self_file' })).toBe(false);
  });
});

describe('corrective notice after the D38 correction (0008 marker)', () => {
  // The correction moves legacy rows to self_file; the marker stays.
  const corrected: ClaimFields = { status: 'self_file', corrective_notice_required: true };
  const answered: ClaimFields = { ...corrected, corrective_notice_answered_at: '2026-10-01T00:00:00Z' };

  it('still shows the notice on a corrected claim nobody has answered', () => {
    expect(displayClaimStatus(corrected, OPEN)).toMatchObject({
      label: 'Not filed yet',
      legacy: true,
      showNotice: true,
    });
    expect(displayClaimStatus(corrected, PAST_60_DAYS)).toMatchObject({
      label: 'Not reported filed',
      showNotice: true,
    });
    expect(displayClaimStatus({ status: 'not_reported_filed', corrective_notice_required: true }, PAST_10_DAYS).showNotice).toBe(true);
    expect(needsCorrectiveNotice(corrected)).toBe(true);
  });

  it('keeps "I already filed" open long after the 30-day window', () => {
    expect(claimActionAvailability(corrected, PAST_60_DAYS)).toMatchObject({
      reportFiled: true,
      answerCorrectiveNotice: true,
    });
    const p = planClaimTransition(corrected, { action: 'report_filed' }, PAST_60_DAYS, NOW);
    expect(p).toMatchObject({ ok: true, noop: false });
    if (p.ok && !p.noop) {
      expect(p.plan.changes).toMatchObject({
        status: 'reported_filed',
        corrective_notice_answered_at: NOW.toISOString(),
      });
    }
    // Answered "not yet" earlier: no notice, and a report still goes through.
    expect(displayClaimStatus(answered, PAST_60_DAYS).showNotice).toBe(false);
    expect(claimActionAvailability(answered, PAST_60_DAYS).reportFiled).toBe(true);
    expect(planClaimTransition(answered, { action: 'report_filed' }, PAST_60_DAYS, NOW)).toMatchObject({ ok: true });
    // An unmarked claim still closes 30 days after the deadline.
    expect(claimActionAvailability({ status: 'self_file' }, PAST_60_DAYS).reportFiled).toBe(false);
  });

  it('records "I haven\'t filed yet" without moving a corrected claim', () => {
    const p = planClaimTransition(corrected, { action: 'acknowledge_notice' }, OPEN, NOW);
    if (!p.ok || p.noop) throw new Error(`expected a change, got ${JSON.stringify(p)}`);
    expect(p.plan.changes).toEqual({ corrective_notice_answered_at: NOW.toISOString() });
    expect(p.plan.toStatus).toBe('self_file');
    const late = planClaimTransition(
      { status: 'not_reported_filed', corrective_notice_required: true },
      { action: 'acknowledge_notice' },
      PAST_60_DAYS,
      NOW,
    );
    if (!late.ok || late.noop) throw new Error('expected a change');
    expect(late.plan.changes).toEqual({ corrective_notice_answered_at: NOW.toISOString() });
    expect(planClaimTransition(answered, { action: 'acknowledge_notice' }, OPEN, NOW)).toEqual({ ok: true, noop: true });
  });

  it('shows no notice once the user has reported filing', () => {
    expect(displayClaimStatus({ status: 'reported_filed', corrective_notice_required: true }, OPEN).showNotice).toBe(false);
    expect(
      displayClaimStatus({ status: 'submitted', confirmation_number: 'K-1', corrective_notice_required: true }, OPEN),
    ).toMatchObject({ label: 'Submitted · #K-1', showNotice: false });
    expect(claimActionAvailability({ status: 'submitted', confirmation_number: 'K-1', corrective_notice_required: true }, OPEN).correctConfirmation).toBe(true);
  });

  it('gives no "tell us by" date to a claim the old flow showed as filed', () => {
    expect(reportByDay(corrected, '2026-08-17')).toBeNull();
    expect(reportByDay({ status: 'submitted' }, '2026-08-17')).toBeNull();
    expect(reportByDay({ status: 'self_file' }, '2026-08-17')).toBe('2026-09-16');
  });
});

describe('legacyFilingState (D41)', () => {
  it('lets the notice say "you still can file" only while our list shows the settlement open', () => {
    expect(legacyFilingState(OPEN)).toBe('open');
    expect(legacyFilingState(ctx({ status: 'closed', deadline: null }))).toBe('closed_on_list');
    expect(legacyFilingState(ctx({ status: 'closed' }))).toBe('closed_on_list');
    expect(legacyFilingState(ctx({ review_status: 'rejected', deadline: null }))).toBe('unlisted');
    expect(legacyFilingState(PAST_10_DAYS)).toBe('deadline_passed');
    expect(legacyFilingState(ctx({ status: 'closed', deadline: '2026-10-01' }))).toBe('deadline_passed');
  });
});

describe('undo after the late-report window', () => {
  const reported: ClaimFields = { status: 'reported_filed', reported_filed_at: '2026-07-20T00:00:00Z' };

  it('is offered only while the user could tell us again afterwards', () => {
    expect(claimActionAvailability(reported, OPEN).undoReport).toBe(true);
    expect(claimActionAvailability(reported, PAST_10_DAYS).undoReport).toBe(true);
    expect(claimActionAvailability(reported, PAST_60_DAYS).undoReport).toBe(false);
    // A claim the old flow showed as filed can always be reported again.
    expect(claimActionAvailability({ ...reported, corrective_notice_required: true }, PAST_60_DAYS).undoReport).toBe(true);
  });

  it('refuses the undo instead of erasing a report that cannot be made again', () => {
    expect(planClaimTransition(reported, { action: 'undo_report' }, PAST_60_DAYS, NOW)).toMatchObject({
      ok: false,
      refusal: 'window_closed',
    });
    const marked = planClaimTransition(
      { ...reported, corrective_notice_required: true },
      { action: 'undo_report' },
      PAST_60_DAYS,
      NOW,
    );
    expect(marked).toMatchObject({ ok: true, noop: false });
    // ...and after a marked claim is undone, "I filed" still goes through.
    expect(
      claimActionAvailability({ status: 'self_file', corrective_notice_required: true, corrective_notice_answered_at: NOW.toISOString() }, PAST_60_DAYS)
        .reportFiled,
    ).toBe(true);
  });
});

describe('legacyAnswerCopy', () => {
  it('never tells people to file before a deadline that has passed', () => {
    const passed = legacyAnswerCopy('deadline_passed', true);
    expect(passed.notYetLabel).toBe('I didn’t file');
    expect(passed.notYetMessage).toMatch(/deadline has passed/);
    expect(passed.notYetMessage).not.toMatch(/before the deadline|File on the official site/);
    expect(passed.notYetMessage).toMatch(/you can still tell us/);
  });

  it('says "before the deadline" only when there is one, and sends closed or unlisted ones to the official site', () => {
    expect(legacyAnswerCopy('open', true).notYetMessage).toMatch(/before the deadline, then tell us/);
    expect(legacyAnswerCopy('open', false).notYetMessage).not.toMatch(/deadline/);
    expect(legacyAnswerCopy('open', true).notYetLabel).toBe('I haven’t filed yet');
    for (const state of ['closed_on_list', 'unlisted'] as const) {
      expect(legacyAnswerCopy(state, true).notYetMessage).toMatch(/Check the official site to see if it still takes claims/);
    }
  });
});

describe('the How it works status glossary', () => {
  it('explains every label a claim can show today', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('../src/app/how-it-works/page.tsx', import.meta.url), 'utf8');
    const labels = new Set<string>();
    for (const status of CLAIM_STATUSES) {
      for (const c of [OPEN, PAST_10_DAYS, FICTIONAL]) {
        for (const number of [null, 'A-1']) {
          labels.add(displayClaimStatus({ status, confirmation_number: number }, c).label.replace(/#.*$/, '#'));
        }
      }
    }
    // No Phase 0 path withdraws a claim on a real settlement (D45 is Phase 2).
    labels.delete('Withdrawn by you');
    for (const label of labels) expect(page, label).toContain(`label: '${label}`);
  });
});
