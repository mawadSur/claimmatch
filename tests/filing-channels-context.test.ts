import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  /** Tables whose reads answer an error (a failed query, not "no row"). */
  failing: new Set<string>(),
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  runJev: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/jev', () => ({ runJev: h.runJev, JEV_ENGINE_VERSION: 'jev-1', validateJevRules: vi.fn() }));

import {
  countSameIdentity,
  emailChannelConfigured,
  loadJobContext,
  loadSettlementFiling,
  preSendInput,
  runAndStoreJev,
  type JobContext,
  type SettlementFiling,
} from '@/lib/filing/channels/context';
import type { FilingJobRecord } from '@/lib/filing/channels/types';
import { DEFAULT_EFFECTIVE_POLICY, FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare it is true.' },
  member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
  deadline: { date: '2026-11-20', time_zone: 'America/Los_Angeles', type: 'submit_online_by' },
});
const PACKET = {
  format: 'claimmatch.packet.v1',
  claim_id: ID(1),
  lawsuit_id: ID(2),
  spec: { id: ID(3), version: 1 },
  member: { legal_name: 'Ada  Lovelace', first_name: null, last_name: null, email: 'ada@example.test', phone: null, address: { line1: '1 Main St', line2: null, city: 'X', state: 'CA', zip: '94110' } },
  answers: {},
  benefit_tier: null,
  payout_method: null,
  documents: [{ id: ID(9), kind: 'receipt', sha256: sha('bytes'), mime: 'application/pdf', size_bytes: 5 }],
  confirmations: { class_definition: true, health_data_consent: true },
  class_definition_sha256: sha('All buyers.'),
  attestation_sha256: sha('I declare it is true.'),
};
const CANONICAL = JSON.stringify(PACKET);
const JOB = { id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), packet_id: ID(4), signature_id: ID(5), packet_hash: sha(CANONICAL), spec_id: ID(3), channel: 'filing_desk' } as FilingJobRecord;
const SETTLEMENT: SettlementFiling = {
  lawsuit: { id: ID(2), slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31', claim_url: null, administrator_id: null, third_party_fee_status: 'unknown' },
  administrator: null,
  policy: { ...DEFAULT_EFFECTIVE_POLICY, health_sensitive: true, health_consent_text: 'I agree to share health information.' },
  approvedSpec: null,
};

function svc() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'in', 'limit']) chain[name] = () => chain;
      chain.maybeSingle = async () =>
        h.failing.has(table) ? { data: null, error: { code: '57014' } } : { data: h.rows[table] ?? null, error: null };
      chain.insert = (row: Record<string, unknown>) => {
        h.inserts.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { id: ID(77) }, error: null }) }) };
      };
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: h.rows[`${table}[]`] ?? [], error: null }).then(resolve, reject);
      return chain;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(['bytes']), error: null }) }) },
  } as never;
}

beforeEach(() => {
  h.inserts = [];
  h.failing = new Set();
  h.runJev.mockReset();
  h.rows = {
    claims: { id: ID(1), user_id: ID(30), lawsuit_id: ID(2), status: 'filing' },
    claim_signatures: {
      id: ID(5), claim_id: ID(1), spec_id: ID(3), packet_hash: sha(CANONICAL), packet_canonical: CANONICAL, statement_text: 'I declare it is true.',
      statement_sha256: sha('I declare it is true.'), authorization_text_version: 'agent-auth-v1', typed_name: 'Ada Lovelace', lane: 'filing_desk', signed_at: '2026-11-12T15:00:00Z',
    },
    claim_signature_voids: null,
    claim_packets: { id: ID(4), status: 'signed', health_consent_text_sha256: sha('I agree to share health information.') },
    filing_specs: { id: ID(3), lawsuit_id: ID(2), version: 1, status: 'superseded', content: SPEC },
    'claim_documents[]': [
      { id: ID(9), kind: 'receipt', mime: 'application/pdf', size_bytes: 5, sha256: sha('bytes'), storage_path: 'p', status: 'stored', source: 'member', claim_id: ID(1) },
      { id: ID(10), kind: 'receipt', mime: 'application/pdf', size_bytes: 5, sha256: sha('x'), storage_path: 'q', status: 'stored', source: 'member', claim_id: ID(99) },
    ],
  };
});

describe('loadJobContext', () => {
  it('loads the signed packet, its spec version and its stored documents', async () => {
    const out = await loadJobContext(svc(), JOB, new Map([[ID(2), SETTLEMENT]]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ctx.packet.member.legal_name).toBe('Ada  Lovelace');
    expect(out.ctx.spec.status).toBe('superseded');
    expect(out.ctx.documents.map((d) => d.id)).toEqual([ID(9)]);
    expect(new TextDecoder().decode(await out.ctx.documents[0].read())).toBe('bytes');
    expect(out.ctx.signature).toMatchObject({ signature_id: ID(5), voided: false, lane: 'filing_desk' });
  });

  it('refuses a packet whose text no longer matches its hash, or another claim’s packet', async () => {
    (h.rows.claim_signatures as Record<string, unknown>).packet_canonical = CANONICAL.replace('Ada', 'Eve');
    expect(await loadJobContext(svc(), JOB, new Map([[ID(2), SETTLEMENT]]))).toEqual({ ok: false, reason: 'packet_hash_mismatch' });
    const other = JSON.stringify({ ...PACKET, claim_id: ID(8) });
    h.rows.claim_signatures = { ...(h.rows.claim_signatures as object), packet_canonical: other, packet_hash: sha(other) };
    expect(await loadJobContext(svc(), { ...JOB, packet_hash: sha(other) }, new Map([[ID(2), SETTLEMENT]]))).toEqual({ ok: false, reason: 'packet_unreadable' });
  });
});

describe('pre_send', () => {
  it('builds Jev’s input from the signed packet, today’s policy and the deadline in the spec’s zone', async () => {
    const out = await loadJobContext(svc(), JOB, new Map([[ID(2), SETTLEMENT]]));
    if (!out.ok) throw new Error('no context');
    const input = preSendInput(out.ctx, new Date('2026-11-13T07:30:00Z'), 0);
    expect(input).toMatchObject({
      mode: 'pre_send',
      lane: 'filing_desk',
      packetHash: sha(CANONICAL),
      spec: { status: 'superseded', attestation_sha256: sha('I declare it is true.'), class_definition_sha256: sha('All buyers.') },
      settlement: { openForClaims: true, deadline: '2026-11-20', daysToDeadline: 8 }, // still the 12th in Los Angeles
      healthConsent: { required: true, textAvailable: true, given: true },
      signature: { id: ID(5), voided: false, statement_sha256: sha('I declare it is true.') },
      duplicates: { sameIdentityOtherAccounts: 0 },
    });
    const ctx: JobContext = { ...out.ctx, packetRow: { ...out.ctx.packetRow, health_consent_text_sha256: sha('an older text') } };
    expect(preSendInput(ctx, new Date('2026-11-13T07:30:00Z'), null).healthConsent.given).toBe(false);
  });

  it('stores every run, and a run that cannot happen blocks', async () => {
    const out = await loadJobContext(svc(), JOB, new Map([[ID(2), SETTLEMENT]]));
    if (!out.ok) throw new Error('no context');
    h.runJev.mockImplementation(() => {
      throw new Error('not implemented');
    });
    const { result, runId } = await runAndStoreJev(svc(), preSendInput(out.ctx, new Date(), null), { claimId: ID(1), userId: ID(30), packetId: ID(4) }, 'worker');
    expect(result.outcome).toBe('block');
    expect(result.issues[0]).toMatchObject({ code: 'engine_unavailable', audience: 'staff' });
    expect(runId).toBe(ID(77));
    expect(h.inserts).toEqual([
      { table: 'jev_runs', row: expect.objectContaining({ claim_id: ID(1), packet_id: ID(4), mode: 'pre_send', triggered_by: 'worker', outcome: 'block', lane: 'filing_desk' }) },
    ]);
  });

  it('counts other accounts that signed with the same name and address', async () => {
    const twin = JSON.stringify({ ...PACKET, member: { ...PACKET.member, legal_name: 'ada lovelace' } });
    h.rows['claim_signatures[]'] = [
      { user_id: ID(30), packet_canonical: CANONICAL },
      { user_id: ID(31), packet_canonical: twin },
      { user_id: ID(32), packet_canonical: JSON.stringify({ ...PACKET, member: { ...PACKET.member, address: { ...PACKET.member.address, zip: '10001' } } }) },
      { user_id: ID(33), packet_canonical: 'not json' },
    ];
    const ctx = { packet: PACKET, claim: { id: ID(1), user_id: ID(30), lawsuit_id: ID(2), status: 'filing' } } as unknown as JobContext;
    expect(await countSameIdentity(svc(), ctx)).toBe(1);
  });
});

describe('loadSettlementFiling', () => {
  const lawsuitRow = {
    id: ID(2), slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31',
    claim_url: null, administrator_id: ID(50), third_party_fee_status: 'unknown',
  };
  const allowed = {
    id: ID(60), lawsuit_id: ID(2), administrator_id: null, version: 1, status: 'approved', agent_filing: 'allowed',
    allowed_states: ['CA'], channels: [{ type: 'filing_desk', enabled: true }], approved_by: ID(40), approved_at: '2026-11-10T00:00:00Z',
  };

  it('reads the kill switch and the administrator into the policy in force', async () => {
    h.rows = {
      lawsuits: lawsuitRow,
      filing_policies: allowed,
      filing_controls: { lawsuit_id: ID(2), kill_switch: true, kill_switch_reason: 'Administrator objected' },
      administrators: { id: ID(50), slug: 'epiq', name: 'Epiq' },
    };
    const out = await loadSettlementFiling(svc(), ID(2));
    expect(out?.policy.kill_switch).toBe(true);
    expect(out?.administrator).toMatchObject({ slug: 'epiq' });
  });

  it.each(['filing_controls', 'filing_policies', 'filing_specs', 'administrators'])(
    'fails closed (null) when the %s read fails, so a kill switch or a prohibition is never read as none',
    async (table) => {
      h.rows = { lawsuits: lawsuitRow, filing_policies: allowed, filing_controls: { lawsuit_id: ID(2), kill_switch: true, kill_switch_reason: 'x' } };
      h.failing = new Set([table]);
      expect(await loadSettlementFiling(svc(), ID(2))).toBeNull();
    },
  );
});

describe('email channel configuration', () => {
  it('needs a Resend key and a real sender', () => {
    expect(emailChannelConfigured({ RESEND_API_KEY: 'k', RESEND_FROM: 'Lawsuit AI <claims@lawsuitai.org>' })).toBe(true);
    expect(emailChannelConfigured({ RESEND_API_KEY: 'k', RESEND_FROM: 'Lawsuit AI <onboarding@resend.dev>' })).toBe(false);
    expect(emailChannelConfigured({ RESEND_FROM: 'claims@lawsuitai.org' })).toBe(false);
  });
});
