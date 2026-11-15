import { createApiClient } from '@/lib/api';
import {
  completeDocument,
  createDocumentSlot,
  deleteDocument,
  getFiling,
  getLanePreview,
  isFilingOff,
  signPacket,
  startFiling,
  updatePacket,
  uploadToSignedUrl,
  withdrawClaim,
} from '@/features/filing/api';

import { CLAIM_ID, DOC_ID, HASH, LAWSUIT_ID, SPEC_ID, filingView } from './filing-fixtures';

const mockFetch = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-2', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => client };
});
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => '33333333-3333-4333-8333-333333333333',
}));

function answer(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: status < 300, status, text: async () => JSON.stringify(body) });
}

function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
}

beforeEach(() => mockFetch.mockReset());

describe('the filing API client (same /api/filing/claims routes as the web)', () => {
  it('reads a claim with the app bearer token', async () => {
    const view = filingView();
    answer(200, { filing: view });
    const result = await getFiling(CLAIM_ID);
    expect(result).toEqual({ ok: true, data: view });
    const { url, init } = lastCall();
    expect(url).toBe(`https://api.test/api/filing/claims/${CLAIM_ID}`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(init.body).toBeUndefined();
  });

  it('starts a claim, saves the packet at its revision and withdraws with a reason', async () => {
    answer(201, { filing: filingView() });
    await startFiling(LAWSUIT_ID);
    expect(lastCall().url).toBe('https://api.test/api/filing/claims');
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ lawsuit_id: LAWSUIT_ID });

    answer(200, { filing: filingView() });
    await updatePacket(CLAIM_ID, 3, { answers: { widget_count: 2 } });
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().url).toBe(`https://api.test/api/filing/claims/${CLAIM_ID}/packet`);
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ revision: 3, answers: { widget_count: 2 } });

    answer(200, { filing: filingView({ status: 'withdrawn' }) });
    await withdrawClaim(CLAIM_ID, 'filed_myself');
    expect(lastCall().url).toBe(`https://api.test/api/filing/claims/${CLAIM_ID}/withdraw`);
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ reason: 'filed_myself' });
  });

  it('signs with the Idempotency-Key header, which never replaces the bearer token', async () => {
    answer(200, { filing: filingView({ status: 'queued' }) });
    const body = {
      packet_hash: HASH,
      revision: 3,
      spec_id: SPEC_ID,
      spec_version: 2,
      typed_name: 'Ada Lovelace',
      attestation_accepted: true as const,
      authorization_accepted: true as const,
      authorization_text_version: 'agent-auth-v1',
    };
    const result = await signPacket(CLAIM_ID, body, 'key-1');
    expect(result.ok).toBe(true);
    const { url, init } = lastCall();
    expect(url).toBe(`https://api.test/api/filing/claims/${CLAIM_ID}/sign`);
    expect(init.headers['Idempotency-Key']).toBe('key-1');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it('asks for document slots, completes and deletes them, never sending a file name', async () => {
    answer(200, {
      document: {
        id: DOC_ID,
        kind: 'receipt',
        status: 'pending_upload',
        mime: 'image/jpeg',
        size_bytes: 1000,
        sha256: null,
        created_at: '2026-11-12T14:10:00Z',
        stored_at: null,
      },
      upload: { signed_url: 'https://storage.test/upload', token: 't', path: 'p', expires_at: '2026-11-12T16:10:00Z' },
    });
    const slot = await createDocumentSlot(CLAIM_ID, { kind: 'receipt', mime: 'image/jpeg', size_bytes: 1000 });
    expect(slot.ok).toBe(true);
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ kind: 'receipt', mime: 'image/jpeg', size_bytes: 1000 });

    answer(409, { error: 'Upload the file first.', code: 'upload_incomplete' });
    const done = await completeDocument(CLAIM_ID, DOC_ID);
    expect(lastCall().url).toBe(`https://api.test/api/filing/claims/${CLAIM_ID}/documents/${DOC_ID}/complete`);
    expect(done).toMatchObject({ ok: false, status: 409, code: 'upload_incomplete', error: 'Upload the file first.' });

    answer(404, { error: 'Not found.', code: 'not_found' });
    await deleteDocument(CLAIM_ID, DOC_ID);
    expect(lastCall().init.method).toBe('DELETE');
    expect(lastCall().init.body).toBeUndefined();
  });

  it('reads the lane preview for a settlement', async () => {
    answer(200, {
      preview: {
        lawsuit_id: LAWSUIT_ID,
        lane: { lane: 'filing_desk', agent: true, reasons: [], last_day_for_agent: null, deadline: null },
        claim_id: null,
        can_start: true,
      },
    });
    const result = await getLanePreview(LAWSUIT_ID);
    expect(lastCall().url).toBe(`https://api.test/api/filing/claims/preview?lawsuit_id=${LAWSUIT_ID}`);
    expect(result).toMatchObject({ ok: true, data: { can_start: true, lane: { lane: 'filing_desk' } } });
  });

  it('reads 404 as one-click filing being off, and keeps Jev issues and field errors', async () => {
    answer(404, { error: 'Not found.', code: 'not_found' });
    const off = await getFiling(CLAIM_ID);
    expect(off.ok).toBe(false);
    if (!off.ok) expect(isFilingOff(off)).toBe(true);

    answer(422, {
      error: 'Fix the items below.',
      code: 'jev_blocked',
      issues: [{ rule_id: 'r1', source: 'global', severity: 'block', code: 'zip_missing', message: 'Add your ZIP code.', field: 'member.address.zip' }],
      fields: [{ path: 'answers.widget_count', message: 'Enter a whole number.' }],
    });
    const blocked = await getFiling(CLAIM_ID);
    expect(blocked).toMatchObject({
      ok: false,
      status: 422,
      code: 'jev_blocked',
      issues: [{ message: 'Add your ZIP code.' }],
      fields: [{ path: 'answers.widget_count' }],
    });
    if (!blocked.ok) expect(isFilingOff(blocked)).toBe(false);
  });

  it('answers a network failure with the shared network message', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    const result = await getFiling(CLAIM_ID);
    expect(result).toMatchObject({ ok: false, status: 0, code: 'network' });
  });

  it('never uploads to a URL that is not https', async () => {
    const result = await uploadToSignedUrl('http://storage.test/upload', new Blob(['x']), 'image/jpeg', () => undefined);
    expect(result).toEqual({ ok: false, status: 0 });
  });
});

describe('createApiClient headers', () => {
  it('adds extra headers but never lets them replace Authorization, Accept or Content-Type', async () => {
    const fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }) as unknown as Response);
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch,
      session: {
        getAccessToken: async () => ({ status: 'ok', token: 'real', userId: 'u' }),
        refreshAccessToken: async () => ({ status: 'ok', token: 'real', userId: 'u' }),
        signOutLocally: async () => undefined,
      },
    });
    await client.request('/api/x', { headers: { authorization: 'Bearer fake', Accept: 'text/html', 'X-Extra': '1' } });
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer real',
      'X-Extra': '1',
    });
  });
});
