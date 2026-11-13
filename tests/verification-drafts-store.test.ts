import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tables: new Map<string, { rows: Record<string, unknown>[]; inserts: Record<string, unknown>[]; updates: Record<string, unknown>[] }>(),
  decisions: [] as Record<string, unknown>[],
}));

function table(name: string) {
  if (!h.tables.has(name)) h.tables.set(name, { rows: [], inserts: [], updates: [] });
  return h.tables.get(name)!;
}

function thenable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.neq = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.update = (payload: Record<string, unknown>) => {
    (result as { updates?: unknown }).updates = payload;
    return builder;
  };
  builder.insert = (payload: Record<string, unknown>) => {
    (result as { inserts?: unknown }).inserts = payload;
    return builder;
  };
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (name: string) => {
      const t = table(name);
      if (name === 'lawsuits' && t.rows.length) {
        return thenable({ data: t.rows, error: null });
      }
      if (name === 'verification_drafts') {
        const result: {
          data: unknown;
          error: null;
          inserts: Record<string, unknown> | null;
          updates: Record<string, unknown> | null;
        } = { data: t.rows, error: null, inserts: null, updates: null };
        const builder = thenable(result);
        builder.insert = (payload: Record<string, unknown>) => {
          t.inserts.push(payload);
          result.inserts = payload;
          t.rows.push({ id: 'draft-new', ...payload });
          return builder;
        };
        builder.update = (payload: Record<string, unknown>) => {
          t.updates.push(payload);
          result.updates = payload;
          return builder;
        };
        builder.eq = (col: string, value: unknown) => {
          if (col === 'status' && value === 'pending') {
            result.data = t.rows.filter((row) => row.status === 'pending');
          }
          if (col === 'id') {
            result.data = t.rows.find((row) => row.id === value) ?? null;
          }
          return builder;
        };
        builder.maybeSingle = async () => ({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          error: null,
        });
        return builder;
      }
      return thenable({ data: t.rows, error: null });
    },
  }),
}));

vi.mock('@/lib/held-closures', () => ({
  recordHeldClosureDecision: async (row: Record<string, unknown>) => {
    h.decisions.push(row);
    return { ok: true };
  },
}));

vi.mock('@/lib/indexnow', () => ({
  notifyIndexNowBestEffort: async () => undefined,
}));

vi.mock('@/lib/analytics/server', () => ({
  captureServerEvent: async () => false,
}));

vi.mock('@/lib/anthropic', () => ({
  extractVerificationDraft: async () => {
    throw new Error('LLM must be mocked in tests');
  },
}));

import { persistVerificationDrafts, reviewVerificationDraft } from '@/lib/verification-drafts-store';

beforeEach(() => {
  h.tables.clear();
  h.decisions.length = 0;
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('persistVerificationDrafts', () => {
  it('no-ops when the flag is off and does not fetch', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const summary = await persistVerificationDrafts({ fetchFn, llmFn: null });
    expect(summary.skippedReason).toMatch(/VERIFY_ASSIST_ENABLED is off/);
    expect(summary.drafted).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches the official page, skips the LLM, and stores a pending heuristic draft', async () => {
    vi.stubEnv('VERIFY_ASSIST_ENABLED', '1');
    table('lawsuits').rows.push({
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'blender',
      title: 'Blender settlement',
      claim_url: 'https://example.test/claim',
      source_url: null,
      status: 'open',
      review_status: 'published',
      verified_at: null,
      deadline: '2027-01-15',
    });
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response(
        '<p>The claim deadline is January 15, 2027. File a claim. No proof of purchase required. Administrator: Epiq.</p>',
        { status: 200 },
      );
    });

    const summary = await persistVerificationDrafts({
      fetchFn: fetchFn as unknown as typeof fetch,
      llmFn: null,
      lawsuitId: '00000000-0000-4000-8000-000000000001',
    });
    expect(summary.drafted).toBe(1);
    expect(summary.failed).toBe(0);
    const inserted = table('verification_drafts').inserts[0] ?? table('verification_drafts').updates[0];
    expect(inserted).toMatchObject({
      status: 'pending',
      claims_status: 'open',
      extractor: 'heuristic',
      proof_verified: 'no',
      administrator: 'Epiq',
    });
    expect(inserted?.deadline).toBe('2027-01-15');
    expect(inserted).not.toHaveProperty('verified_at');
    expect(inserted).not.toHaveProperty('verified_by');
    expect(fetchFn.mock.calls.some((call: unknown[]) => String(call[0]).includes('/claim'))).toBe(true);
  });
});

describe('reviewVerificationDraft', () => {
  const draftRow = {
    id: '11111111-1111-4111-8111-111111111111',
    lawsuit_id: '00000000-0000-4000-8000-000000000001',
    source_url: 'https://example.test/claim',
    status: 'pending',
    claims_status: 'closed',
    deadline: '2026-01-01',
    eligibility_verified: 'US residents.',
    proof_verified: 'no',
    administrator: 'Epiq',
    evidence: { claims_status: { quote: 'The claim period has ended.', source_url: 'https://example.test/claim' } },
    extractor: 'heuristic',
    http_status: 200,
    robots_allowed: true,
    error: null,
    created_at: '2026-11-13T00:00:00Z',
    lawsuit: { id: '00000000-0000-4000-8000-000000000001', slug: 'blender', title: 'Blender', status: 'open', review_status: 'pending_review', deadline: null },
  };

  it('refuses writes when the flag is off', async () => {
    const result = await reviewVerificationDraft({
      id: draftRow.id,
      action: 'accept',
      adminId: 'admin-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/turned off/);
  });

  it('records a close on held_closure_decisions with source admin', async () => {
    vi.stubEnv('VERIFY_ASSIST_ENABLED', '1');
    table('verification_drafts').rows.push(draftRow);
    table('lawsuits').rows.push({
      id: draftRow.lawsuit_id,
      slug: 'blender',
      status: 'open',
    });
    // Load pending uses maybeSingle on verification_drafts; update lawsuits uses single.
    const result = await reviewVerificationDraft({
      id: draftRow.id,
      action: 'close',
      adminId: 'admin-1',
      now: new Date('2026-11-13T12:00:00Z'),
    });
    expect(result.ok).toBe(true);
    expect(h.decisions[0]).toMatchObject({
      slug: 'blender',
      decision: 'approved',
      source: 'admin',
      fingerprint: 'verify-assist:site-closed',
      adminId: 'admin-1',
    });
  });
});
