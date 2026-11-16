import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allowedNextStatuses,
  claimActionAvailability,
  planClaimTransition,
  settlementContext,
  type ClaimAction,
  type ClaimFields,
} from '@/lib/claims';
import { CLAIM_TRANSITIONS, FILING_CLAIM_STATUSES, canMoveClaim } from '@/lib/filing/v2/contract';
import { startableStatus } from '@/lib/filing/v2/view-model';

// Founder decision 2026-11-15: a withdrawn claim is final. Nothing in the app
// moves a claim out of withdrawn, and 0048 refuses it in the database too.

const NOW = new Date('2026-10-16T18:00:00Z');
const OPEN = settlementContext({ slug: 'real-settlement', status: 'open', review_status: 'published', deadline: '2026-11-30' }, NOW, () => false);
const LATE = settlementContext({ slug: 'real-settlement', status: 'open', review_status: 'published', deadline: '2026-10-06' }, NOW, () => false);
const withdrawn: ClaimFields = { status: 'withdrawn' };
const marked: ClaimFields = { status: 'withdrawn', corrective_notice_required: true };

describe('withdrawn is final', () => {
  it('the one-click transition table has no move out of withdrawn (mirrors 0042)', () => {
    expect(CLAIM_TRANSITIONS.withdrawn).toBeUndefined();
    for (const to of FILING_CLAIM_STATUSES) expect(canMoveClaim('withdrawn', to)).toBe(false);
  });

  it('the self-file model offers nothing next and every action is refused or a no-op', () => {
    for (const claim of [withdrawn, marked]) {
      for (const c of [OPEN, LATE]) {
        expect(allowedNextStatuses(claim, c)).toEqual([]);
        const can = claimActionAvailability(claim, c);
        expect([can.reportFiled, can.addConfirmation, can.correctConfirmation, can.undoReport]).toEqual([false, false, false, false]);
        const actions: ClaimAction[] = [
          { action: 'report_filed' },
          { action: 'report_filed', confirmation_number: 'AB-123' },
          { action: 'add_confirmation', confirmation_number: 'AB-123' },
          { action: 'undo_report' },
          { action: 'withdraw' },
        ];
        for (const action of actions) {
          const result = planClaimTransition(claim, action, c, NOW);
          if (result.ok) {
            expect(result.noop).toBe(true);
          } else {
            expect(result.ok).toBe(false);
          }
        }
      }
    }
  });

  it('one-click start refuses a withdrawn claim (no new packet, no move back to preparing)', () => {
    expect(startableStatus({ status: 'withdrawn', view: withdrawn } as never)).toBe('blocked');
  });

  it('0048 refuses any status change out of withdrawn in the database', () => {
    const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/0048_withdrawn_final.sql', import.meta.url)), 'utf8');
    expect(sql).toMatch(/old\.status\s*=\s*'withdrawn'/);
    expect(sql).toContain('CM001');
    expect(sql).toMatch(/before update of status on public\.claims/);
  });
});
