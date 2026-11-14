/**
 * A small in-memory Supabase for the member filing API tests (B2). Member
 * clients (cookie, bearer) see only their own rows of the member-readable
 * tables and may write nothing but their profile, as RLS and the grants
 * allow; the service client sees and writes everything. The 0006 and 0039
 * functions the routes call are emulated with their checks, so a test fails
 * when the canonical packet would not satisfy filing_sign_packet.
 */
import { createHash, randomUUID } from 'node:crypto';

export type Row = Record<string, unknown>;
export type DbError = { code: string; message?: string };
type Filter = { col: string; kind: 'eq' | 'neq' | 'in' | 'is'; value: unknown };
type Result = { data: unknown; error: DbError | null; count?: number | null };

const MEMBER_TABLES: Record<string, string> = {
  claims: 'user_id',
  claim_packets: 'user_id',
  claim_documents: 'user_id',
  claim_signatures: 'user_id',
  claim_signature_voids: 'user_id',
  esign_consents: 'user_id',
  claim_events: 'user_id',
  profiles: 'id',
};

export const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

export class FakeDb {
  tables: Record<string, Row[]> = {};
  objects = new Map<string, Uint8Array>();
  storageCalls: Array<{ op: string; path: string; options?: unknown }> = [];
  writes: Array<{ client: string; table: string; op: string; values?: unknown }> = [];
  rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  failures: Array<{ table: string; op: string; error: DbError }> = [];
  rpcOverrides: Record<string, (params: Record<string, unknown>) => Result | undefined> = {};

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  insertRow(table: string, row: Row): Row {
    const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
    this.rows(table).push(full);
    return full;
  }
  find(table: string, pred: (r: Row) => boolean): Row | undefined {
    return this.rows(table).find(pred);
  }
  failNext(table: string, op: string, error: DbError) {
    this.failures.push({ table, op, error });
  }
  takeFailure(table: string, op: string): DbError | null {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op);
    if (i < 0) return null;
    return this.failures.splice(i, 1)[0].error;
  }
  event(claimId: string, from: unknown, to: string, actor: string, detail: Row) {
    const claim = this.find('claims', (c) => c.id === claimId);
    this.insertRow('claim_events', { claim_id: claimId, user_id: claim?.user_id, from_status: from ?? null, to_status: to, actor, detail });
  }

  client(name: 'cookie' | 'bearer' | 'service', userId: string | null) {
    const db = this;
    return {
      from: (table: string) => new Query(db, name, userId, table),
      rpc: async (fn: string, params: Record<string, unknown>) => {
        if (name !== 'service') return { data: null, error: { code: '42501', message: 'permission denied' } };
        db.rpcCalls.push({ name: fn, params });
        const override = db.rpcOverrides[fn]?.(params);
        if (override) return override;
        return runRpc(db, fn, params);
      },
      storage: {
        from: (bucket: string) => storageApi(db, name, bucket),
      },
    };
  }
}

function storageApi(db: FakeDb, client: string, bucket: string) {
  const denied = { data: null, error: { name: 'StorageApiError', status: 403, message: 'denied' } };
  return {
    createSignedUploadUrl: async (path: string, options?: unknown) => {
      if (client !== 'service') return denied;
      db.storageCalls.push({ op: 'createSignedUploadUrl', path: `${bucket}/${path}`, options });
      return { data: { signedUrl: `https://storage.example.test/upload/${bucket}/${path}?token=tok`, token: 'tok', path }, error: null };
    },
    download: async (path: string) => {
      db.storageCalls.push({ op: 'download', path: `${bucket}/${path}` });
      const bytes = db.objects.get(`${bucket}/${path}`);
      return bytes
        ? { data: new Blob([Buffer.from(bytes)]), error: null }
        : { data: null, error: { name: 'StorageApiError', status: 400, message: 'Object not found' } };
    },
    remove: async (paths: string[]) => {
      if (client !== 'service') return denied;
      for (const p of paths) {
        db.storageCalls.push({ op: 'remove', path: `${bucket}/${p}` });
        db.objects.delete(`${bucket}/${p}`);
      }
      return { data: [], error: null };
    },
    createSignedUrl: async (path: string, ttl: number) => {
      db.storageCalls.push({ op: 'createSignedUrl', path: `${bucket}/${path}`, options: ttl });
      return { data: { signedUrl: `https://storage.example.test/sign/${bucket}/${path}?ttl=${ttl}` }, error: null };
    },
  };
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | null = null;
  private filters: Filter[] = [];
  private values: unknown = null;
  private returning = false;
  private head = false;
  private countMode = false;
  private single: 'maybe' | 'single' | null = null;
  private orderCol: string | null = null;
  private ascending = true;

  constructor(
    private db: FakeDb,
    private client: string,
    private userId: string | null,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (!this.op) this.op = 'select';
    else this.returning = true;
    if (opts?.head) this.head = true;
    if (opts?.count) this.countMode = true;
    return this;
  }
  insert(values: unknown) {
    this.op = 'insert';
    this.values = values;
    return this;
  }
  update(values: unknown) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ col, kind: 'eq', value });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ col, kind: 'neq', value });
    return this;
  }
  in(col: string, value: unknown[]) {
    this.filters.push({ col, kind: 'in', value });
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push({ col, kind: 'is', value });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.ascending = opts?.ascending !== false;
    return this;
  }
  maybeSingle() {
    this.single = 'maybe';
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }

  private matches(row: Row): boolean {
    const scope = MEMBER_TABLES[this.table];
    if (this.client !== 'service') {
      if (row[scope] !== this.userId) return false;
      if (this.table === 'claim_documents' && row.source !== 'member') return false;
    }
    return this.filters.every((f) => {
      const v = row[f.col] ?? null;
      if (f.kind === 'eq') return v === f.value;
      if (f.kind === 'neq') return v !== f.value;
      if (f.kind === 'is') return v === f.value;
      return (f.value as unknown[]).includes(v);
    });
  }

  private run(): Result {
    const injected = this.db.takeFailure(this.table, this.op ?? 'select');
    if (injected) return { data: null, error: injected };
    const member = this.client !== 'service';
    if (member && !MEMBER_TABLES[this.table]) return { data: null, error: { code: '42501', message: 'permission denied' } };
    if (member && this.op !== 'select' && !(this.table === 'profiles' && this.op === 'update')) {
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    }
    if (this.op !== 'select') this.db.writes.push({ client: this.client, table: this.table, op: this.op ?? '', values: this.values });
    const rows = this.db.rows(this.table);
    let out: Row[] = [];
    if (this.op === 'select') out = rows.filter((r) => this.matches(r));
    else if (this.op === 'insert') {
      const list = (Array.isArray(this.values) ? this.values : [this.values]) as Row[];
      for (const value of list) {
        const conflict = uniqueConflict(this.db, this.table, value);
        if (conflict) return { data: null, error: { code: '23505', message: conflict } };
        out.push(this.db.insertRow(this.table, withDefaults(this.table, value)));
      }
    } else if (this.op === 'update') {
      out = rows.filter((r) => this.matches(r));
      for (const r of out) Object.assign(r, this.values as Row, { updated_at: new Date().toISOString() });
    } else if (this.op === 'delete') {
      out = rows.filter((r) => this.matches(r));
      this.db.tables[this.table] = rows.filter((r) => !out.includes(r));
    }
    if (this.orderCol) {
      const col = this.orderCol;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (this.ascending ? 1 : -1));
    }
    if (this.countMode && this.head) return { data: null, error: null, count: out.length };
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };
    const copies = out.map((r) => structuredClone(r));
    if (this.single === 'maybe') {
      if (copies.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' } };
      return { data: copies[0] ?? null, error: null };
    }
    return { data: copies, error: null };
  }
}

function withDefaults(table: string, value: Row): Row {
  const now = new Date().toISOString();
  if (table === 'claim_packets') return { status: 'open', revision: 1, answers: {}, member_snapshot: {}, updated_at: now, ...value };
  if (table === 'esign_consents') return { ...value, consented_at: now, withdrawn_at: null };
  if (table === 'claim_documents') return { status: 'pending_upload', health_flag: false, sha256: null, stored_at: null, deleted_at: null, ...value };
  return value;
}

function uniqueConflict(db: FakeDb, table: string, value: Row): string | null {
  if (table === 'claim_packets' && db.find(table, (r) => r.claim_id === value.claim_id)) return 'claim_packets_claim_id_key';
  if (table === 'esign_consents' && db.find(table, (r) => r.user_id === value.user_id && r.text_version === value.text_version && r.withdrawn_at === null)) {
    return 'esign_consents_active_idx';
  }
  return null;
}

const FRESH = ['password', 'oauth', 'sso/saml', 'totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn'];

function err(code: string, message = code): Result {
  return { data: null, error: { code, message } };
}

/** The 0006 and 0039 functions the member routes call, with their checks. */
function runRpc(db: FakeDb, fn: string, p: Record<string, unknown>): Result {
  const claimOf = (id: unknown, user: unknown) => db.find('claims', (c) => c.id === id && c.user_id === user);
  if (fn === 'claim_start_tracking') {
    const existing = db.find('claims', (c) => c.user_id === p.p_user_id && c.lawsuit_id === p.p_lawsuit_id);
    if (existing) return { data: { created: false, claim: structuredClone(existing) }, error: null };
    const now = new Date().toISOString();
    const claim = db.insertRow('claims', {
      user_id: p.p_user_id,
      lawsuit_id: p.p_lawsuit_id,
      lawsuit_title: p.p_lawsuit_title,
      status: p.p_status,
      confirmation_number: null,
      updated_at: now,
    });
    db.event(String(claim.id), null, String(p.p_status), String(p.p_actor), p.p_detail as Row);
    return { data: { created: true, claim: structuredClone(claim) }, error: null };
  }
  if (fn === 'claim_apply_change') {
    const claim = claimOf(p.p_claim_id, p.p_user_id);
    if (!claim) return err('P0002');
    if (claim.status !== p.p_expected_status) return err('40001');
    const to = (p.p_changes as Row).status;
    const packet = db.find('claim_packets', (r) => r.claim_id === claim.id);
    if ((to === 'preparing' || to === 'ready') && packet?.status === 'closed') return err('CM001');
    const from = claim.status;
    Object.assign(claim, p.p_changes as Row, { updated_at: new Date().toISOString() });
    db.event(String(claim.id), from, String(to), String(p.p_actor), p.p_detail as Row);
    return { data: structuredClone(claim), error: null };
  }
  if (fn === 'filing_sign_packet') return signPacket(db, p);
  if (fn === 'filing_record_confirmation') {
    const claim = claimOf(p.p_claim_id, p.p_user_id);
    if (!claim) return err('P0002');
    if (claim.status !== 'filed_by_claimmatch') return err('CM001');
    Object.assign(claim, { status: 'submitted', confirmation_number: String(p.p_confirmation_number).trim() });
    db.event(String(claim.id), 'filed_by_claimmatch', 'submitted', String(p.p_actor), { action: 'confirmation_recorded' });
    return { data: { claim: structuredClone(claim) }, error: null };
  }
  return err('42883', `no function ${fn}`);
}

function signPacket(db: FakeDb, p: Record<string, unknown>): Result {
  const claim = db.find('claims', (c) => c.id === p.p_claim_id && c.user_id === p.p_user_id);
  if (!claim) return err('P0002');
  const prior = db.find('claim_signatures', (s) => s.user_id === p.p_user_id && s.idempotency_key === p.p_idempotency_key);
  if (prior) {
    if (prior.claim_id !== p.p_claim_id || prior.packet_hash !== p.p_packet_hash) return err('CM008');
    return { data: { created: false, claim: structuredClone(claim), signature: { id: prior.id, signed_at: prior.signed_at, packet_hash: prior.packet_hash, lane: prior.lane } }, error: null };
  }
  const authTime = Date.parse(String(p.p_auth_time));
  if (!FRESH.includes(String(p.p_auth_method)) || !(authTime >= Date.now() - 900_000)) return err('CM015');
  if (claim.status !== 'ready') return err('CM001');
  const packet = db.find('claim_packets', (r) => r.id === p.p_packet_id && r.claim_id === p.p_claim_id);
  if (!packet) return err('P0002');
  if (packet.status !== 'open') return err('CM002');
  if (packet.packet_hash !== p.p_packet_hash || packet.spec_id !== p.p_spec_id) return err('CM003');
  let doc: Row;
  try {
    doc = JSON.parse(String(p.p_packet_canonical)) as Row;
  } catch {
    return err('CM003');
  }
  if (sha(String(p.p_packet_canonical)) !== p.p_packet_hash) return err('23514', 'claim_signatures_hash_matches');
  const docSpec = doc.spec as Row | null;
  if (doc.format !== 'claimmatch.packet.v1' || doc.claim_id !== p.p_claim_id || doc.lawsuit_id !== claim.lawsuit_id || docSpec?.id !== p.p_spec_id) {
    return err('CM003');
  }
  const spec = db.find('filing_specs', (s) => s.id === p.p_spec_id);
  if (!spec || spec.status !== 'approved' || spec.lawsuit_id !== claim.lawsuit_id || docSpec?.version !== spec.version) return err('CM009');
  const content = spec.content as { attestation: { text: string }; class_definition: { text: string } };
  if (content.attestation.text !== p.p_statement_text || doc.attestation_sha256 !== sha(String(p.p_statement_text))) return err('CM010');
  if (doc.class_definition_sha256 !== sha(content.class_definition.text) || (doc.confirmations as Row)?.class_definition !== true) return err('CM003');
  const voided = new Set(db.rows('claim_signature_voids').map((v) => v.signature_id));
  if (db.rows('claim_signatures').some((s) => s.claim_id === claim.id && !voided.has(s.id))) return err('CM004');
  const consent = db.find('esign_consents', (e) => e.id === p.p_esign_consent_id && e.user_id === p.p_user_id && e.withdrawn_at === null);
  if (!consent) return err('CM011');
  const signedAt = new Date().toISOString();
  const sig = db.insertRow('claim_signatures', {
    claim_id: claim.id,
    user_id: claim.user_id,
    lawsuit_id: claim.lawsuit_id,
    packet_id: packet.id,
    spec_id: spec.id,
    spec_version: spec.version,
    packet_hash: p.p_packet_hash,
    packet_canonical: p.p_packet_canonical,
    statement_text: p.p_statement_text,
    statement_sha256: sha(String(p.p_statement_text)),
    authorization_text_version: p.p_authorization_text_version,
    authorization_text: p.p_authorization_text,
    typed_name: String(p.p_typed_name).trim(),
    lane: p.p_lane,
    esign_consent_id: p.p_esign_consent_id,
    auth_method: p.p_auth_method,
    auth_time: p.p_auth_time,
    session_id: p.p_session_id,
    ip: p.p_ip,
    user_agent: p.p_user_agent,
    idempotency_key: p.p_idempotency_key,
    jev_run_id: p.p_jev_run_id,
    signed_at: signedAt,
  });
  Object.assign(packet, { status: 'signed', signature_id: sig.id, signed_at: signedAt });
  Object.assign(claim, { status: 'signed' });
  db.event(String(claim.id), 'ready', 'signed', 'user', { ...(p.p_detail as Row), action: 'signed', signature_id: sig.id, lane: p.p_lane });
  return { data: { created: true, claim: structuredClone(claim), signature: { id: sig.id, signed_at: signedAt, packet_hash: sig.packet_hash, lane: sig.lane } }, error: null };
}
