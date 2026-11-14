import { beforeEach, describe, expect, it, vi } from 'vitest';

// The cron's housekeeping steps against a fake service client. Job and claim
// moves go through src/lib/filing/v2/jobs.ts, faked here; they are the
// database functions' callers, tested in filing-jobs-state.test.ts.
const m = vi.hoisted(() => ({
  recordFilingResult: vi.fn(),
  withdrawFiling: vi.fn(),
  enqueueFiling: vi.fn(),
  alerts: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/v2/jobs', () => ({ recordFilingResult: m.recordFilingResult, withdrawFiling: m.withdrawFiling, enqueueFiling: m.enqueueFiling }));
vi.mock('@/lib/cron-alert', () => ({
  postAlertWebhook: async (payload: Record<string, unknown>) => {
    m.alerts.push(payload);
  },
}));

import type { SettlementFiling, SpecRow } from '@/lib/filing/channels/context';
import {
  blockedDestination,
  expirePendingUploads,
  expireStaleLocks,
  HAND_BACK_PAGE,
  handBackSweep,
  RETENTION_PAGE,
  retentionSweep,
  staffAlerts,
} from '@/lib/filing/channels/cron-sweeps';
import { resolveEffectivePolicy } from '@/lib/filing/channels/index';
import { FilingPolicyContentSchema, FilingSpecContentSchema, type FilingPolicyContentInput } from '@/lib/filing/v2/contract-spec';

type Query = { table: string; op: 'select' | 'update' | 'insert'; patch: unknown; filters: Array<[string, ...unknown[]]> };

function fakeSvc(answer: (q: Query) => unknown[]) {
  const queries: Query[] = [];
  const removed: string[][] = [];
  const from = (table: string) => {
    const q: Query = { table, op: 'select', patch: null, filters: [] };
    const run = () => {
      queries.push(q);
      return answer(q);
    };
    const chain: Record<string, unknown> = {};
    for (const op of ['eq', 'in', 'lt', 'lte', 'is', 'not', 'order', 'limit', 'range']) {
      chain[op] = (...args: unknown[]) => {
        q.filters.push([op, ...args]);
        return chain;
      };
    }
    chain.select = () => chain;
    chain.update = (patch: unknown) => {
      q.op = 'update';
      q.patch = patch;
      return chain;
    };
    chain.maybeSingle = async () => ({ data: run()[0] ?? null, error: null });
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject);
    return chain;
  };
  const storage = { from: () => ({ remove: async (paths: string[]) => (removed.push(paths), { data: [], error: null }) }) };
  return { svc: { from, storage } as never, queries, removed };
}

/** The rows a query's .range(from, to) or .limit(n) asks for (the fake honors paging). */
const pageOf = <T,>(q: Query, rows: T[]): T[] => {
  const range = q.filters.find(([o]) => o === 'range');
  if (range) return rows.slice(Number(range[1]), Number(range[2]) + 1);
  const limit = q.filters.find(([o]) => o === 'limit');
  return limit ? rows.slice(0, Number(limit[1])) : rows;
};
/** The ids a query's .in(column, ids) names. */
const inList = (q: Query, column: string): unknown[] => (q.filters.find(([o, c]) => o === 'in' && c === column)?.[2] as unknown[]) ?? [];
const has = (q: Query, op: string, ...args: unknown[]) => q.filters.some(([o, ...a]) => o === op && JSON.stringify(a) === JSON.stringify(args));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LAWSUIT = ID(2);

const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare it is true.' },
  member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
});
const SPEC_ROW: SpecRow = { id: ID(3), lawsuit_id: LAWSUIT, version: 1, status: 'approved', content: SPEC };

function settlement(content: FilingPolicyContentInput, killSwitch = false): SettlementFiling {
  const record = { ...FilingPolicyContentSchema.parse(content), id: ID(6), lawsuit_id: LAWSUIT, administrator_id: null, version: 1, status: 'approved' as const, approved_by: ID(7), approved_at: '2026-11-01T00:00:00Z' };
  return {
    lawsuit: { id: LAWSUIT, slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31', claim_url: null, administrator_id: null, third_party_fee_status: 'unknown' },
    administrator: null,
    policy: resolveEffectivePolicy({
      settlementPolicy: record,
      administratorPolicy: null,
      settlementControls: killSwitch ? { lawsuit_id: LAWSUIT, administrator_id: null, kill_switch: true, kill_switch_reason: 'objection call', objection_received_at: null } : null,
      administratorControls: null,
      thirdPartyFeeStatus: 'unknown',
    }),
    approvedSpec: SPEC_ROW,
  };
}
const DESK_ONLY = { agent_filing: 'allowed' as const, allowed_states: ['CA'], channels: [{ type: 'filing_desk' as const, enabled: true }] };

beforeEach(() => {
  for (const fn of [m.recordFilingResult, m.withdrawFiling, m.enqueueFiling]) fn.mockReset();
  m.recordFilingResult.mockResolvedValue({ ok: true });
  m.withdrawFiling.mockResolvedValue({ ok: true, changed: true });
  m.alerts = [];
});

describe('expired locks', () => {
  it('become needs_attention under their own lock owner, never queued again', async () => {
    const { svc, queries } = fakeSvc((q) => (q.table === 'claim_filing_jobs' ? [{ id: ID(20), lock_owner: 'staff:x' }, { id: ID(21), lock_owner: 'worker:old' }] : []));
    expect(await expireStaleLocks(svc, new Date('2026-11-12T15:00:00Z'))).toEqual({ expired: 2, failed: 0 });
    expect(has(queries[0], 'eq', 'status', 'in_progress')).toBe(true);
    expect(has(queries[0], 'lt', 'lock_expires_at', '2026-11-12T15:00:00.000Z')).toBe(true);
    expect(m.recordFilingResult.mock.calls.map(([i]) => [i.jobId, i.lockOwner, i.outcome, i.reasonCode])).toEqual([
      [ID(20), 'staff:x', 'needs_attention', 'lock_expired'],
      [ID(21), 'worker:old', 'needs_attention', 'lock_expired'],
    ]);
  });
});

describe('hand-backs', () => {
  const claims = [
    { id: ID(11), user_id: ID(31), lawsuit_id: LAWSUIT, status: 'queued' },
    { id: ID(12), user_id: ID(32), lawsuit_id: LAWSUIT, status: 'preparing' },
    { id: ID(13), user_id: ID(33), lawsuit_id: LAWSUIT, status: 'signed' },
  ];
  const tables = (q: Query) => {
    switch (q.table) {
      case 'claims':
        return claims;
      case 'claim_packets':
        return claims.map((c) => ({ claim_id: c.id, spec_id: ID(3), benefit_tier: null, member_snapshot: { address: { state: 'CA' } }, health_consent_at: null }));
      case 'profiles':
        return [];
      case 'claim_documents':
        return [];
      case 'claim_signatures':
        return [
          { claim_id: ID(11), lane: 'filing_desk', signed_at: '2026-11-10T00:00:00Z' },
          { claim_id: ID(13), lane: 'administrator_email', signed_at: '2026-11-10T00:00:00Z' },
        ];
      case 'filing_specs':
        return [{ ...SPEC_ROW }];
      default:
        return [];
    }
  };

  it('keeps claims Lawsuit AI can still take; a signed claim whose lane changed signs again', async () => {
    const { svc } = fakeSvc(tables);
    const out = await handBackSweep(svc, new Date('2026-11-12T15:00:00Z'), new Map([[LAWSUIT, settlement(DESK_ONLY)]]));
    expect(out).toMatchObject({ checked: 3, handedBack: 0, resign: 1 });
    expect(m.withdrawFiling.mock.calls.map(([i]) => [i.claimId, i.to, i.reasonCode, i.actor])).toEqual([[ID(13), 'needs_you', 'lane_changed', 'system']]);
  });

  it('hands every open claim back to the official site once the channel’s cutoff passed', async () => {
    const { svc } = fakeSvc(tables);
    const out = await handBackSweep(svc, new Date('2026-12-28T15:00:00Z'), new Map([[LAWSUIT, settlement(DESK_ONLY)]]));
    expect(out.handedBack).toBe(3);
    expect(m.withdrawFiling.mock.calls.map(([i]) => [i.to, i.reasonCode])).toEqual([
      ['self_file', 'deadline_too_close'],
      ['self_file', 'deadline_too_close'],
      ['self_file', 'deadline_too_close'],
    ]);
  });

  it('after a kill switch, with a member-safe reason only', async () => {
    const { svc } = fakeSvc(tables);
    await handBackSweep(svc, new Date('2026-11-12T15:00:00Z'), new Map([[LAWSUIT, settlement(DESK_ONLY, true)]]));
    expect(new Set(m.withdrawFiling.mock.calls.map(([i]) => i.reasonCode))).toEqual(new Set(['not_offered_for_settlement']));
  });

  it('checks every open claim page by page, so a kill switch reaches the newest claims too, with short id lists', async () => {
    const many = Array.from({ length: HAND_BACK_PAGE * 2 + 5 }, (_, i) => ({
      id: ID(1000 + i),
      user_id: ID(5000 + i),
      lawsuit_id: i === HAND_BACK_PAGE * 2 + 4 ? 'l-killed' : LAWSUIT,
      status: 'preparing',
    }));
    const { svc, queries } = fakeSvc((q) => {
      if (q.table === 'claims') return pageOf(q, many);
      if (q.table === 'claim_packets') {
        return inList(q, 'claim_id').map((id) => ({ claim_id: id, spec_id: ID(3), benefit_tier: null, member_snapshot: { address: { state: 'CA' } } }));
      }
      return [];
    });
    const killed = { ...settlement(DESK_ONLY, true), lawsuit: { ...settlement(DESK_ONLY).lawsuit, id: 'l-killed' } };
    const out = await handBackSweep(
      svc,
      new Date('2026-11-12T15:00:00Z'),
      new Map([
        [LAWSUIT, settlement(DESK_ONLY)],
        ['l-killed', killed],
      ]),
    );
    expect(out).toMatchObject({ checked: many.length, handedBack: 1 });
    expect(m.withdrawFiling.mock.calls.map(([i]) => [i.claimId, i.to])).toEqual([[many[many.length - 1].id, 'self_file']]);
    for (const q of queries.filter((x) => x.table !== 'claims')) {
      for (const [op, , list] of q.filters) if (op === 'in' && Array.isArray(list)) expect(list.length).toBeLessThanOrEqual(HAND_BACK_PAGE);
    }
  });

  it('never hands back for desk capacity or email configuration', async () => {
    const { svc } = fakeSvc((q) => (q.table === 'claim_signatures' ? [{ claim_id: ID(11), lane: 'filing_desk' }] : tables(q)));
    await handBackSweep(svc, new Date('2026-11-12T15:00:00Z'), new Map([[LAWSUIT, settlement({ ...DESK_ONLY, channels: [{ type: 'filing_desk', enabled: true, daily_capacity: 1, sla_business_days: 1 }] })]]));
    expect(m.withdrawFiling.mock.calls.map(([i]) => i.claimId)).not.toContain(ID(11));
  });
});

describe('Jev blocks on a signed claim without a job', () => {
  const result = (rules: string[], code = 'x') => ({ issues: rules.map((rule_id) => ({ rule_id, severity: 'block', code })) }) as never;
  it('go back to the member when they can fix it, to the official site when not, and wait when Jev is down', () => {
    expect(blockedDestination(result(['global.required_answers']))).toBe('needs_you');
    expect(blockedDestination(result(['global.signature_binding']))).toBe('needs_you');
    expect(blockedDestination(result(['global.required_answers', 'global.deadline_cutoff']))).toBe('self_file');
    expect(blockedDestination(result(['global.engine'], 'engine_unavailable'))).toBe('retry');
  });

  it('hand a staff-only settlement rule back to the official site: the member never sees it', () => {
    const issue = (audience: 'member' | 'staff') => ({ rule_id: 'kroger.receipt_check', source: 'settlement', severity: 'block', code: 'settlement_rule', audience });
    expect(blockedDestination({ issues: [issue('member')] } as never)).toBe('needs_you');
    expect(blockedDestination({ issues: [issue('staff')] } as never)).toBe('self_file');
    expect(blockedDestination({ issues: [{ ...issue('member'), source: 'global', rule_id: 'global.x', code: 'staff_check_required' }] } as never)).toBe('self_file');
  });

  it('with the real engine: a staff-only settlement block goes to self_file, a member one to needs_you', async () => {
    const { runJev } = await vi.importActual<typeof import('@/lib/jev')>('@/lib/jev');
    const { jevInput, withRules } = await import('./jev-fixtures');
    const run = (audience: 'member' | 'staff') => {
      const rule = { id: 'test.receipt', description: 'Receipt check', severity: 'block', check: { field: 'answers.item_count', op: 'lte', value: 0 }, message: 'Too many items without a receipt.', audience };
      const result = runJev(jevInput({}, { content: withRules([rule]) }));
      expect(result.issues.some((i) => i.rule_id === 'test.receipt' && i.severity === 'block')).toBe(true);
      return result;
    };
    expect(blockedDestination(run('member'))).toBe('needs_you');
    expect(blockedDestination(run('staff'))).toBe('self_file');
  });
});

describe('uploads and retention', () => {
  it('deletes upload slots older than two hours (object and row)', async () => {
    const { svc, queries, removed } = fakeSvc((q) => {
      if (q.op === 'update') return [{ id: ID(50) }];
      return [{ id: ID(50), storage_path: `${ID(30)}/${ID(1)}/${ID(50)}.pdf` }];
    });
    expect(await expirePendingUploads(svc, new Date('2026-11-12T15:00:00Z'))).toEqual({ deleted: 1 });
    expect(removed).toEqual([[`${ID(30)}/${ID(1)}/${ID(50)}.pdf`]]);
    const update = queries.find((q) => q.op === 'update');
    expect(update?.patch).toMatchObject({ status: 'deleted', delete_reason: 'upload_expired' });
    expect(update && has(update, 'eq', 'status', 'pending_upload')).toBe(true);
  });

  it('deletes member uploads 90 days after the final status, never a signed packet’s', async () => {
    const now = new Date('2026-11-12T15:00:00Z');
    const old = '2026-07-01T00:00:00Z';
    const docs = [
      { id: ID(51), claim_id: ID(61), packet_id: ID(71), storage_path: 'a/submitted.pdf' },
      { id: ID(52), claim_id: ID(62), packet_id: ID(72), storage_path: 'b/signed.pdf' },
      { id: ID(53), claim_id: ID(63), packet_id: ID(73), storage_path: 'c/open-claim.pdf' },
      { id: ID(54), claim_id: ID(64), packet_id: ID(74), storage_path: 'd/past-deadline.pdf' },
    ];
    const { svc, queries, removed } = fakeSvc((q) => {
      if (q.op === 'update') return [{ id: ID(51) }, { id: ID(54) }];
      switch (q.table) {
        case 'claim_documents':
          return docs;
        case 'claims':
          return [
            { id: ID(61), status: 'submitted', updated_at: old, lawsuit_id: 'l-open' },
            { id: ID(62), status: 'submitted', updated_at: old, lawsuit_id: 'l-open' },
            { id: ID(63), status: 'preparing', updated_at: old, lawsuit_id: 'l-open' },
            { id: ID(64), status: 'needs_you', updated_at: old, lawsuit_id: 'l-past' },
          ];
        case 'claim_packets':
          return [{ id: ID(72), status: 'signed' }];
        case 'lawsuits':
          return [
            { id: 'l-open', deadline: '2026-12-31' },
            { id: 'l-past', deadline: '2026-06-01' },
          ];
        default:
          return [];
      }
    });
    expect(await retentionSweep(svc, now)).toEqual({ deleted: 2 });
    expect(removed).toEqual([['a/submitted.pdf', 'd/past-deadline.pdf']]);
    const first = queries[0];
    expect(has(first, 'eq', 'source', 'member')).toBe(true);
    expect(queries.find((q) => q.op === 'update')?.patch).toMatchObject({ status: 'deleted', delete_reason: 'retention' });
  });
});

describe('retention at scale', () => {
  it('old uploads that must stay longer never hold back the ones that are due', async () => {
    const now = new Date('2026-11-12T15:00:00Z');
    const old = '2026-07-01T00:00:00Z';
    // A full page of old uploads of a claim still being prepared (kept), then one of a submitted claim (due).
    const docs = [
      ...Array.from({ length: RETENTION_PAGE }, (_, i) => ({ id: ID(2000 + i), claim_id: ID(61), packet_id: ID(71), storage_path: `keep/${i}.pdf` })),
      { id: ID(3000), claim_id: ID(62), packet_id: ID(72), storage_path: 'due/submitted.pdf' },
    ];
    const { svc, removed } = fakeSvc((q) => {
      if (q.op === 'update') return [{ id: ID(3000) }];
      switch (q.table) {
        case 'claim_documents':
          return pageOf(q, docs);
        case 'claims':
          return [
            { id: ID(61), status: 'preparing', updated_at: old, lawsuit_id: 'l-open' },
            { id: ID(62), status: 'submitted', updated_at: old, lawsuit_id: 'l-open' },
          ].filter((c) => inList(q, 'id').includes(c.id));
        case 'lawsuits':
          return [{ id: 'l-open', deadline: '2026-12-31' }];
        default:
          return [];
      }
    });
    expect(await retentionSweep(svc, now)).toEqual({ deleted: 1 });
    expect(removed).toEqual([['due/submitted.pdf']]);
  });
});

describe('staff alerts', () => {
  it('count needs_attention jobs every run, urgent ones near the deadline, and overdue desk jobs; no member data', async () => {
    const { svc } = fakeSvc((q) => {
      if (q.table === 'claim_filing_jobs' && has(q, 'eq', 'status', 'needs_attention')) {
        return [{ id: ID(20), lawsuit_id: 'l-soon' }, { id: ID(21), lawsuit_id: 'l-later' }];
      }
      if (q.table === 'claim_filing_jobs') return [{ id: ID(22) }];
      if (q.table === 'lawsuits') return [{ id: 'l-soon', deadline: '2026-11-14' }, { id: 'l-later', deadline: '2026-12-31' }];
      return [];
    });
    expect(await staffAlerts(svc, new Date('2026-11-12T15:00:00Z'))).toEqual({ needsAttention: 2, urgent: 1, overdue: 1 });
    expect(m.alerts).toEqual([
      { job: 'cron/filing', error: '2 filing job(s) need attention; URGENT: 1 with a deadline in 3 days or less; 1 desk job(s) past due', at: '2026-11-12T15:00:00.000Z' },
    ]);
  });

  it('stays quiet when nothing needs a person', async () => {
    const { svc } = fakeSvc(() => []);
    await staffAlerts(svc, new Date('2026-11-12T15:00:00Z'));
    expect(m.alerts).toEqual([]);
  });
});
