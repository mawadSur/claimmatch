import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILING_ERROR_MESSAGES, IDEMPOTENCY_HEADER } from '@/lib/filing/v2/contract';
import { ONE_CLICK_COPY } from '@/lib/copy';
import {
  addConfirmationNumber,
  completeDocument,
  createDocumentSlot,
  deleteDocument,
  getFiling,
  giveEsignConsent,
  moveToSelfFile,
  newIdempotencyKey,
  reopenFiling,
  signPacket,
  startFiling,
  updatePacket,
  uploadToSignedUrl,
  withdrawClaim,
} from '@/components/filing/filing-api';
import { CLAIM_ID, DOC_ID, HASH, LAWSUIT_ID, SPEC_ID, filingView } from './filing-ui-fixtures';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let respond: () => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls.length = 0;
  respond = () => json({ filing: filingView() });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const header = (call: Call, name: string) => new Headers(call.init.headers).get(name);

describe('member filing API calls', () => {
  it('reads a claim’s view with the session cookie and no body', async () => {
    const result = await getFiling(CLAIM_ID);
    expect(result.ok && result.data.claim.id).toBe(CLAIM_ID);
    expect(calls[0].url).toBe(`/api/filing/claims/${CLAIM_ID}`);
    expect(calls[0].init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    expect(calls[0].init.body).toBeUndefined();
    expect(header(calls[0], 'Content-Type')).toBeNull();
  });

  it('sends every write as JSON, DELETE included (the API refuses other bodies with 415)', async () => {
    await startFiling(LAWSUIT_ID);
    await updatePacket(CLAIM_ID, { revision: 3, answers: { widget_count: 3 } });
    await reopenFiling(CLAIM_ID);
    await moveToSelfFile(CLAIM_ID);
    await withdrawClaim(CLAIM_ID, 'filed_myself');
    await addConfirmationNumber(CLAIM_ID, 'ABC-1');
    respond = () => json({ document: { id: DOC_ID, kind: 'receipt', status: 'deleted', mime: 'image/png', size_bytes: 10, sha256: null, created_at: '2026-11-12T14:00:00Z', stored_at: null } });
    await deleteDocument(CLAIM_ID, DOC_ID);
    expect(calls.map((c) => [c.init.method, c.url, c.init.body])).toEqual([
      ['POST', '/api/filing/claims', JSON.stringify({ lawsuit_id: LAWSUIT_ID })],
      ['PATCH', `/api/filing/claims/${CLAIM_ID}/packet`, JSON.stringify({ revision: 3, answers: { widget_count: 3 } })],
      ['POST', `/api/filing/claims/${CLAIM_ID}/reopen`, '{}'],
      ['POST', `/api/filing/claims/${CLAIM_ID}/self-file`, '{}'],
      ['POST', `/api/filing/claims/${CLAIM_ID}/withdraw`, JSON.stringify({ reason: 'filed_myself' })],
      ['POST', `/api/filing/claims/${CLAIM_ID}/confirmation`, JSON.stringify({ confirmation_number: 'ABC-1' })],
      ['DELETE', `/api/filing/claims/${CLAIM_ID}/documents/${DOC_ID}`, '{}'],
    ]);
    for (const call of calls) expect(header(call, 'Content-Type')).toBe('application/json');
  });

  it('signs with the Idempotency-Key header and the exact body', async () => {
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
    const key = '3f0e6a52-8f7c-4c1f-9d9a-2b7e5c1d0a11';
    const result = await signPacket(CLAIM_ID, body, key);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(`/api/filing/claims/${CLAIM_ID}/sign`);
    expect(header(calls[0], IDEMPOTENCY_HEADER)).toBe(key);
    expect(JSON.parse(String(calls[0].init.body))).toEqual(body);
  });

  it('asks for upload slots without file names and completes them', async () => {
    respond = () =>
      json(
        {
          document: { id: DOC_ID, kind: 'receipt', status: 'pending_upload', mime: 'image/heic', size_bytes: 1234, sha256: null, created_at: '2026-11-12T14:00:00Z', stored_at: null },
          upload: { signed_url: 'https://storage.example/upload/sign/x?token=t', token: 't', path: 'u/c/d.heic', expires_at: '2026-11-12T16:00:00Z' },
        },
        201,
      );
    const slot = await createDocumentSlot(CLAIM_ID, { kind: 'receipt', mime: 'image/heic', size_bytes: 1234 });
    expect(slot.ok && slot.data.upload.token).toBe('t');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ kind: 'receipt', mime: 'image/heic', size_bytes: 1234 });
    respond = () => json({ document: { id: DOC_ID, kind: 'receipt', status: 'stored', mime: 'image/heic', size_bytes: 1234, sha256: HASH, created_at: '2026-11-12T14:00:00Z', stored_at: '2026-11-12T14:00:05Z' } });
    const done = await completeDocument(CLAIM_ID, DOC_ID);
    expect(done.ok && done.data.document.status).toBe('stored');
    expect(calls[1].url).toBe(`/api/filing/claims/${CLAIM_ID}/documents/${DOC_ID}/complete`);
  });

  it('records E-SIGN consent for the shown text version', async () => {
    respond = () => json({ consent: { id: DOC_ID, text_version: 'esign-v1', consented_at: '2026-11-12T14:00:00Z', withdrawn_at: null } });
    const result = await giveEsignConsent(CLAIM_ID, 'esign-v1');
    expect(result.ok).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ accepted: true, text_version: 'esign-v1' });
  });

  it('encodes the claim id', async () => {
    await getFiling('a/b?c');
    expect(calls[0].url).toBe('/api/filing/claims/a%2Fb%3Fc');
  });
});

describe('errors come back as FilingErrorBody', () => {
  it('passes the server’s error through, issues and all', async () => {
    const body = {
      error: FILING_ERROR_MESSAGES.reauth_required,
      code: 'reauth_required',
      issues: [{ rule_id: 'global.x', source: 'global', severity: 'block', code: 'x_y', message: 'M', field: null }],
    };
    respond = () => json(body, 403);
    const result = await getFiling(CLAIM_ID);
    expect(result).toEqual({ ok: false, status: 403, error: body });
  });

  it('says something true when the error body is unreadable', async () => {
    respond = () => new Response('<html>Bad gateway</html>', { status: 502 });
    expect(await getFiling(CLAIM_ID)).toEqual({
      ok: false,
      status: 502,
      error: { error: FILING_ERROR_MESSAGES.service_unavailable, code: 'service_unavailable' },
    });
    respond = () => new Response('nope', { status: 401 });
    expect((await getFiling(CLAIM_ID)) as unknown).toMatchObject({ error: { code: 'unauthorized' } });
    respond = () => new Response('nope', { status: 429 });
    expect((await getFiling(CLAIM_ID)) as unknown).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('refuses a 200 that does not match the contract', async () => {
    respond = () => json({ filing: { api_version: 1 } });
    expect(await getFiling(CLAIM_ID)).toMatchObject({ ok: false, error: { code: 'service_unavailable' } });
  });

  it('reports a network failure with status 0', async () => {
    respond = () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await startFiling(LAWSUIT_ID)).toEqual({
      ok: false,
      status: 0,
      error: { error: ONE_CLICK_COPY.network, code: 'service_unavailable' },
    });
  });
});

describe('idempotency keys', () => {
  it('are UUID v4', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });
});

describe('uploads to the signed URL', () => {
  class FakeXhr {
    static last: FakeXhr | null = null;
    static status = 200;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    body: unknown = null;
    status = 0;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send(body: unknown) {
      this.body = body;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 200, total: 200 });
      this.status = FakeXhr.status;
      if (this.status === 0) this.onerror?.();
      else this.onload?.();
    }
  }

  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('PUTs the bytes with their type, no upsert, and reports progress', async () => {
    FakeXhr.status = 200;
    const progress: number[] = [];
    const file = new Blob(['x'], { type: 'image/png' });
    expect(await uploadToSignedUrl('https://storage.example/u?token=t', file, 'image/png', (p) => progress.push(p))).toEqual({ ok: true });
    expect(FakeXhr.last).toMatchObject({ method: 'PUT', url: 'https://storage.example/u?token=t', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' } });
    expect(FakeXhr.last?.body).toBe(file);
    expect(progress).toEqual([25, 100]);
  });

  it('reports a refused or dropped upload', async () => {
    FakeXhr.status = 400;
    expect(await uploadToSignedUrl('https://s/u', new Blob(['x']), 'image/png', () => undefined)).toEqual({ ok: false, status: 400 });
    FakeXhr.status = 0;
    expect(await uploadToSignedUrl('https://s/u', new Blob(['x']), 'image/png', () => undefined)).toEqual({ ok: false, status: 0 });
  });
});
