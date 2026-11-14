import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDb } from './filing-v2-fake';
import type { JevKnobs, JobKnobs } from './filing-v2-fixtures';

// Member filing API (B2): saving the packet (boundary checks, Jev refusals,
// health consent, profile write-back, status sync), uploads and E-SIGN consent.
const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  cookieUser: null as { id: string } | null,
  claims: null as Record<string, unknown> | null,
  jev: { runs: [] } as JevKnobs,
  jobs: null as unknown as JobKnobs,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.db.client('cookie', h.cookieUser?.id ?? null),
    auth: {
      getUser: async () => ({ data: { user: h.cookieUser } }),
      getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null, error: null }),
    },
  }),
  createServiceClient: () => h.db.client('service', null),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));
vi.mock('@/lib/admin', () => ({ getAdminUser: async () => null, adminDeniedPath: () => '/login' }));
vi.mock('@/lib/jev/index', async () => {
  const f = await import('./filing-v2-fixtures');
  return { JEV_ENGINE_VERSION: 'jev-1', runJev: (i: never) => f.fakeRunJev(h.jev, i), validateJevRules: () => ({ ok: true, rules: [] }) };
});
vi.mock('@/lib/filing/channels/index', async () => {
  const f = await import('./filing-v2-fixtures');
  return { chooseLane: f.fakeChooseLane, toLaneView: f.fakeToLaneView, resolveEffectivePolicy: f.fakeResolvePolicy, getChannelAdapter: vi.fn() };
});
vi.mock('@/lib/filing/v2/jobs', async () => {
  const f = await import('./filing-v2-fixtures');
  return { FILING_OUTCOMES: [], enqueueFiling: (i: never) => f.fakeEnqueue(h.jobs, i), withdrawFiling: (i: never) => f.fakeWithdraw(h.jobs, i) };
});

import { POST as START } from '@/app/api/filing/claims/route';
import { GET as VIEW } from '@/app/api/filing/claims/[claimId]/route';
import { PATCH } from '@/app/api/filing/claims/[claimId]/packet/route';
import { POST as SLOT } from '@/app/api/filing/claims/[claimId]/documents/route';
import { GET as DOWNLOAD, DELETE as REMOVE } from '@/app/api/filing/claims/[claimId]/documents/[documentId]/route';
import { POST as COMPLETE_UPLOAD } from '@/app/api/filing/claims/[claimId]/documents/[documentId]/complete/route';
import { DELETE as WITHDRAW_CONSENT, POST as CONSENT } from '@/app/api/filing/claims/[claimId]/esign-consent/route';
import { ESIGN_TEXT_V1 } from '@/lib/filing/v2/esign';
import { sha256Hex } from '@/lib/filing/v2/packet';
import { FakeDb as Db, sha } from './filing-v2-fake';
import { EXE_BYTES, HEALTH_TEXT, LAWSUIT, NOW, PNG_BYTES, SPEC_CONTENT, USER_A, USER_B, getRequest, jsonRequest, seedSettlement, signInClaims } from './filing-v2-fixtures';

const p1 = (claimId: string) => ({ params: Promise.resolve({ claimId }) });
const p2 = (claimId: string, documentId: string) => ({ params: Promise.resolve({ claimId, documentId }) });

async function json(res: Response, status: number) {
  expect(res.status).toBe(status);
  return (await res.json()) as Record<string, any>;
}
async function startClaim(): Promise<string> {
  return (await json(await START(jsonRequest('/api/filing/claims', 'POST', { lawsuit_id: LAWSUIT })), 201)).filing.claim.id;
}
function patch(id: string, body: Record<string, unknown>) {
  return PATCH(jsonRequest(`/api/filing/claims/${id}/packet`, 'PATCH', body), p1(id));
}
async function view(id: string) {
  return (await json(await VIEW(getRequest(`/api/filing/claims/${id}`), p1(id)), 200)).filing;
}
const packetRow = () => h.db.rows('claim_packets')[0];
const claimRow = () => h.db.rows('claims')[0];
const COMPLETE = { answers: { purchase_count: 2 }, benefit_tier: 'basic', payout_method: 'check', class_definition_confirmed: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  h.db = new Db();
  seedSettlement(h.db);
  h.cookieUser = { id: USER_A };
  h.claims = signInClaims(USER_A);
  h.jev = { runs: [] };
  h.jobs = { db: h.db, enqueueFails: false, enqueued: [], withdrawn: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('PATCH .../packet', () => {
  it('saves at the revision seen, and the claim reads ready once complete and Jev passes', async () => {
    const id = await startClaim();
    const saved = (await json(await patch(id, { revision: 1, ...COMPLETE }), 200)).filing;
    expect(saved.claim.status).toBe('ready');
    expect(saved.packet).toMatchObject({ revision: 2, complete: true });
    expect(packetRow().packet_hash).toBe(saved.packet.packet_hash);
    expect(h.jev.runs.at(-1)?.mode).toBe('pre_sign');
    expect(h.db.rows('jev_runs').at(-1)).toMatchObject({ mode: 'pre_sign', triggered_by: 'member_save', outcome: 'pass', lane: 'filing_desk' });
    expect(saved.actions.can_sign).toBe(true);
    expect(saved.timeline.map((t: { status: string }) => t.status)).toEqual(['preparing', 'ready']);
    expect(saved.timeline[1]).toMatchObject({ actor: 'claimmatch', action: 'packet_checked' });

    expect(await json(await patch(id, { revision: 1, answers: { store: 'online' } }), 409)).toMatchObject({ code: 'revision_conflict' });
    const back = (await json(await patch(id, { revision: 2, answers: { purchase_count: null } }), 200)).filing;
    expect(back.claim.status).toBe('preparing');
    expect(back.packet).toMatchObject({ revision: 3, complete: false, packet_hash: null });
  });

  it('checks answers at the boundary and refuses what Lawsuit AI never stores', async () => {
    const id = await startClaim();
    const bad = await json(await patch(id, { revision: 1, answers: { purchase_count: 'two' } }), 400);
    expect(bad).toMatchObject({ code: 'invalid_request', fields: [{ path: 'answers.purchase_count', message: 'Enter a whole number.' }] });
    expect(await json(await patch(id, { revision: 1, answers: { bank_pin: '1234' } }), 422)).toMatchObject({ code: 'not_collected' });
    expect(await json(await patch(id, { revision: 1, answers: { purchase_count: 99 } }), 400)).toMatchObject({ fields: [{ message: 'Must be at most 10.' }] });

    // Jev's never-store codes (here: an SSN-like value) are refused, not kept and flagged.
    (h.db.rows('filing_specs')[0].content as typeof SPEC_CONTENT).questions.push({ key: 'notes', official_label: 'Notes', help: null, type: 'text', required: false, options: null, validation: null, visible_when: null, tiers: null, health_flag: false });
    const secret = await json(await patch(id, { revision: 1, answers: { notes: '123-45-6789' } }), 422);
    expect(secret).toMatchObject({ code: 'not_collected', issues: [{ code: 'secret_like_value', field: 'answers.notes' }] });
    expect(packetRow()).toMatchObject({ revision: 1, answers: {} });
    expect(await json(await patch(id, { revision: 1, payout_account: '123' }), 400)).toMatchObject({ code: 'invalid_request' });
  });

  it('collects health answers only with consent to the law firm’s current text', async () => {
    const id = await startClaim();
    expect(await json(await patch(id, { revision: 1, benefit_tier: 'injury', answers: { side_effects: true } }), 422)).toMatchObject({ code: 'health_consent_required' });
    const ok = (await json(await patch(id, { revision: 1, benefit_tier: 'injury', health_consent: true, answers: { side_effects: true } }), 200)).filing;
    expect(ok.packet.choices.health_consent).toBe(true);
    expect(ok.packet.health_consent_text).toBe(HEALTH_TEXT);
    expect(packetRow()).toMatchObject({ health_consent_text_sha256: sha256Hex(HEALTH_TEXT), answers: { side_effects: true } });

    const declined = (await json(await patch(id, { revision: 2, health_consent: false }), 200)).filing;
    expect(packetRow().answers).toEqual({});
    expect(declined.packet.choices.health_consent).toBe(false);
    expect(declined.lane).toMatchObject({ lane: 'self_file', reasons: ['health_consent_needed'] });

    h.db.rows('filing_policies')[0].health_consent_text = null;
    expect(await json(await patch(id, { revision: 3, health_consent: true }), 422)).toMatchObject({ code: 'not_collected' });
  });

  it('saves member details back to the profile only when asked, with the member’s own client', async () => {
    const id = await startClaim();
    await json(await patch(id, { revision: 1, member: { address: { line1: '2 Oak Ave', zip: '10001' } } }), 200);
    expect(h.db.find('profiles', (p) => p.id === USER_A)).toMatchObject({ address_line1: '1 Main St', prefill_consent_at: null });
    await json(await patch(id, { revision: 2, member: { phone: '555-0199' }, save_member_to_profile: true }), 200);
    expect(h.db.find('profiles', (p) => p.id === USER_A)).toMatchObject({ address_line1: '2 Oak Ave', zip: '10001', phone: '555-0199', prefill_consent_at: NOW.toISOString() });
    expect(h.db.writes.filter((w) => w.client === 'cookie').map((w) => w.table)).toEqual(['profiles']);
  });

  it('stays preparing while Jev blocks, and is locked once signed or being filed', async () => {
    const id = await startClaim();
    h.jev.extra = (input) =>
      input.mode === 'pre_sign'
        ? [{ rule_id: 's.rule', source: 'settlement', severity: 'block', code: 'tier_rule', message: 'Without a receipt you can claim up to 1 item.', field: 'answers.purchase_count', audience: 'member' }]
        : [];
    const blocked = (await json(await patch(id, { revision: 1, ...COMPLETE }), 200)).filing;
    expect(blocked.claim.status).toBe('preparing');
    expect(blocked.packet.jev.issues).toEqual([expect.objectContaining({ code: 'tier_rule' })]);
    expect(blocked.actions.can_sign).toBe(false);

    packetRow().status = 'signed';
    claimRow().status = 'queued';
    expect(await json(await patch(id, { revision: 2, answers: { store: 'online' } }), 409)).toMatchObject({ code: 'packet_locked' });
    claimRow().status = 'filing';
    expect(await json(await patch(id, { revision: 2, answers: { store: 'online' } }), 409)).toMatchObject({ code: 'filing_in_progress' });
  });

  it('moves an open packet to a newly approved spec version on its next save', async () => {
    const id = await startClaim();
    await json(await patch(id, { revision: 1, ...COMPLETE, answers: { purchase_count: 2, store: 'online' } }), 200);
    const spec = h.db.rows('filing_specs')[0];
    spec.status = 'superseded';
    const content = structuredClone(spec.content) as typeof SPEC_CONTENT;
    content.questions = content.questions.filter((q) => q.key !== 'store');
    content.class_definition.text = 'All persons who bought the product in 2025.';
    h.db.rows('filing_specs').push({ id: '00000000-0000-4000-8000-0000000000e2', lawsuit_id: LAWSUIT, version: 2, status: 'approved', content });
    const moved = (await json(await patch(id, { revision: 2 }), 200)).filing;
    expect(moved.packet.spec).toMatchObject({ version: 2 });
    expect(packetRow()).toMatchObject({ spec_version: 2, answers: { purchase_count: 2 }, class_definition_confirmed_at: null });
    expect(moved.claim.status).toBe('preparing');
  });
});

describe('documents', () => {
  async function documentedClaim() {
    const id = await startClaim();
    await json(await patch(id, { revision: 1, benefit_tier: 'documented' }), 200);
    return id;
  }
  const slot = (id: string, body: Record<string, unknown>) => SLOT(jsonRequest(`/api/filing/claims/${id}/documents`, 'POST', body), p1(id));
  const complete = (id: string, docId: string) => COMPLETE_UPLOAD(jsonRequest(`/api/filing/claims/${id}/documents/${docId}/complete`, 'POST', {}), p2(id, docId));

  it('issues an upload slot at the server’s path, then stores the file with the hash it computed', async () => {
    const id = await documentedClaim();
    expect(await json(await slot(id, { kind: 'photo', mime: 'image/png', size_bytes: 10 }), 400)).toMatchObject({ code: 'invalid_request' });
    expect(await json(await slot(id, { kind: 'receipt', mime: 'image/webp', size_bytes: 10 }), 422)).toMatchObject({ code: 'document_invalid' });
    const created = await json(await slot(id, { kind: 'receipt', mime: 'image/png', size_bytes: 999 }), 201);
    const docId = created.document.id as string;
    expect(created.upload.path).toBe(`${USER_A}/${id}/${docId}.png`);
    expect(created.document).toMatchObject({ kind: 'receipt', status: 'pending_upload', sha256: null });
    expect(h.db.storageCalls.find((c) => c.op === 'createSignedUploadUrl')?.options).toEqual({ upsert: false });

    expect(await json(await complete(id, docId), 409)).toMatchObject({ code: 'upload_incomplete' });
    h.db.objects.set(`claim-documents/${created.upload.path}`, PNG_BYTES);
    const stored = await json(await complete(id, docId), 200);
    expect(stored.document).toMatchObject({ status: 'stored', sha256: sha(PNG_BYTES), size_bytes: PNG_BYTES.length });
    expect(packetRow().revision).toBe(3);
    const after = await view(id);
    expect(after.packet.items.find((i: { path: string }) => i.path === 'documents.receipt')).toMatchObject({ missing: false });

    const link = await json(await DOWNLOAD(getRequest(`/api/filing/claims/${id}/documents/${docId}`), p2(id, docId)), 200);
    expect(link.url).toContain('ttl=300');
    h.cookieUser = { id: USER_B };
    expect(await json(await DOWNLOAD(getRequest(`/api/filing/claims/${id}/documents/${docId}`), p2(id, docId)), 404)).toMatchObject({ code: 'not_found' });
  });

  it('rejects and removes a file whose bytes are not the declared type', async () => {
    const id = await documentedClaim();
    const created = await json(await slot(id, { kind: 'receipt', mime: 'image/png', size_bytes: 8 }), 201);
    h.db.objects.set(`claim-documents/${created.upload.path}`, EXE_BYTES);
    expect(await json(await complete(id, created.document.id), 422)).toMatchObject({ code: 'document_invalid' });
    expect(h.db.find('claim_documents', (d) => d.id === created.document.id)?.status).toBe('rejected');
    expect(h.db.objects.size).toBe(0);
  });

  it('keeps to the per-kind limit and removes uploads before signing only', async () => {
    const id = await documentedClaim();
    const a = await json(await slot(id, { kind: 'receipt', mime: 'image/png', size_bytes: 8 }), 201);
    await json(await slot(id, { kind: 'receipt', mime: 'image/png', size_bytes: 8 }), 201);
    expect(await json(await slot(id, { kind: 'receipt', mime: 'image/png', size_bytes: 8 }), 409)).toMatchObject({ code: 'document_limit' });
    const removed = await json(await REMOVE(getRequest(`/api/filing/claims/${id}/documents/${a.document.id}`), p2(id, a.document.id)), 200);
    expect(removed.document.status).toBe('deleted');
    packetRow().status = 'signed';
    const other = h.db.rows('claim_documents').find((d) => d.status === 'pending_upload')!;
    expect(await json(await REMOVE(getRequest(`/api/filing/claims/${id}/documents/${other.id}`), p2(id, String(other.id))), 409)).toMatchObject({ code: 'packet_locked' });
  });
});

describe('E-SIGN consent', () => {
  const consent = (id: string, body: Record<string, unknown>) => CONSENT(jsonRequest(`/api/filing/claims/${id}/esign-consent`, 'POST', body), p1(id));

  it('records the exact text once per version, and withdraws it', async () => {
    const id = await startClaim();
    expect(await json(await consent(id, { accepted: true, text_version: 'esign-v0' }), 400)).toMatchObject({ code: 'invalid_request' });
    expect(await json(await consent(id, { accepted: false, text_version: 'esign-v1' }), 400)).toMatchObject({ code: 'invalid_request' });
    const first = await json(await consent(id, { accepted: true, text_version: 'esign-v1' }), 201);
    expect(h.db.rows('esign_consents')[0]).toMatchObject({ full_text: ESIGN_TEXT_V1, text_sha256: sha(ESIGN_TEXT_V1), ip: '203.0.113.7', user_agent: 'vitest', context_claim_id: id });
    expect((await json(await consent(id, { accepted: true, text_version: 'esign-v1' }), 200)).consent.id).toBe(first.consent.id);
    expect((await view(id)).actions.needs_esign_consent).toBe(false);

    const withdrawn = await json(await WITHDRAW_CONSENT(getRequest(`/api/filing/claims/${id}/esign-consent`), p1(id)), 200);
    expect(withdrawn.consent.withdrawn_at).toBe(NOW.toISOString());
    expect((await view(id)).actions.needs_esign_consent).toBe(true);
    expect(await json(await WITHDRAW_CONSENT(getRequest(`/api/filing/claims/${id}/esign-consent`), p1(id)), 404)).toMatchObject({ code: 'not_found' });
  });
});
