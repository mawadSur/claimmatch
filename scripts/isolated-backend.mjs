#!/usr/bin/env node
/**
 * Isolated GoTrue + PostgREST-ish fixture for local Playwright.
 *
 * Not a real Supabase project, not production, not email. Binds 127.0.0.1
 * only. Refuses to start if the listen host is not loopback.
 *
 * The ClaimMatch app talks to this the same way it talks to Supabase:
 * browser signup, cookie session, RSC getUser, catalog reads, profile
 * writes, and the claim RPCs. Catalog rows here are labeled fixtures,
 * never real settlements.
 */
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';

const HOST = process.env.ISOLATED_BACKEND_HOST || '127.0.0.1';
const PORT = Number(process.env.ISOLATED_BACKEND_PORT || 54321);

if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  console.error('isolated-backend: refusing to bind a non-loopback host');
  process.exit(1);
}

export const FIXTURE = {
  lawsuitId: '11111111-1111-4111-8111-111111111111',
  slug: 'isolated-fixture-data-breach',
  title: 'Isolated Fixture Data Breach Settlement',
  officialUrl: 'https://isolated-admin.claimmatch.test/official-claim-form',
};

function nowIso() {
  return new Date().toISOString();
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const sig = randomBytes(16).toString('base64url');
  return `${header}.${body}.${sig}`;
}

function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const users = new Map(); // id -> user
const emails = new Map(); // email -> id
const access = new Map(); // token -> userId
const refresh = new Map(); // refresh -> userId
const profiles = new Map(); // id -> row
const claims = new Map(); // id -> row
const claimEvents = [];

function lawsuitRow() {
  const ts = nowIso();
  return {
    id: FIXTURE.lawsuitId,
    slug: FIXTURE.slug,
    title: FIXTURE.title,
    summary: 'Isolated Playwright catalog row. Not a real settlement.',
    description: 'Fixture only. Do not file. Not a court case.',
    category: 'Data Breach',
    status: 'open',
    typical_payout: 'Fixture amount',
    payout_min: 10,
    payout_max: 50,
    proof_required: false,
    deadline: '2027-12-31',
    eligibility: { states: ['CA'], requires: ['had_data_breach'] },
    eligibility_text:
      'People in California who received a data-breach notice. This listing is an isolated test fixture, not a real case.',
    source_id: null,
    source_url: 'https://isolated-admin.claimmatch.test/notice',
    claim_url: FIXTURE.officialUrl,
    external_id: 'isolated-fixture-1',
    hero_image_url: null,
    is_featured: true,
    review_status: 'published',
    extraction_confidence: null,
    administrator: 'Isolated Fixture Administrator',
    raw_source_text: null,
    estimated_value_min: null,
    estimated_value_max: null,
    reviewed_by: null,
    reviewed_at: null,
    last_seen_at: ts,
    missed_feed_count: 0,
    created_at: ts,
    updated_at: ts,
    closed_at: null,
    last_verified_at: null,
    verified_at: null,
    verified_by: null,
    eligibility_verified: null,
    proof_verified: null,
    form_field_order: null,
    assisted_filing_allowed: false,
    administrator_id: null,
    link_status: 'ok',
    link_http_status: 200,
    link_checked_at: ts,
    third_party_fee_status: 'unknown',
    third_party_fee_allowed: false,
    tags: {},
  };
}

const lawsuits = [lawsuitRow()];

function makeUser({ email, password, fullName }) {
  const id = randomUUID();
  const ts = nowIso();
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: ts,
    phone: '',
    confirmed_at: ts,
    last_sign_in_at: ts,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: fullName || '' },
    identities: [
      {
        id,
        user_id: id,
        identity_id: id,
        provider: 'email',
        identity_data: { email, email_verified: true, full_name: fullName || '' },
        last_sign_in_at: ts,
        created_at: ts,
        updated_at: ts,
      },
    ],
    created_at: ts,
    updated_at: ts,
    is_anonymous: false,
    password,
  };
  users.set(id, user);
  emails.set(email.toLowerCase(), id);
  profiles.set(id, {
    id,
    full_name: fullName || null,
    email,
    onboarded: false,
    state: null,
    attributes: {},
    is_internal: false,
    cohort: null,
    first_ref: null,
    first_utm_campaign: null,
    created_at: ts,
    updated_at: ts,
  });
  return user;
}

function issueSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 36_000;
  const accessToken = signJwt({
    aud: 'authenticated',
    role: 'authenticated',
    sub: user.id,
    email: user.email,
    exp,
    iat: Math.floor(Date.now() / 1000),
    session_id: randomUUID(),
  });
  const refreshToken = randomBytes(24).toString('hex');
  access.set(accessToken, user.id);
  refresh.set(refreshToken, user.id);
  const publicUser = { ...user };
  delete publicUser.password;
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 36_000,
    expires_at: exp,
    refresh_token: refreshToken,
    user: publicUser,
  };
}

function userFromAuth(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  const token = String(raw).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (access.has(token)) return users.get(access.get(token)) || null;
  const payload = decodeJwt(token);
  if (payload?.sub && users.has(payload.sub)) return users.get(payload.sub);
  return null;
}

function parseQuery(url) {
  const q = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (q[k] === undefined) q[k] = v;
    else if (Array.isArray(q[k])) q[k].push(v);
    else q[k] = [q[k], v];
  }
  return q;
}

function parseInList(raw) {
  let s = String(raw ?? '');
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function matchOp(rowVal, expr) {
  const value = rowVal === undefined || rowVal === null ? null : rowVal;
  if (expr === 'is.null') return value === null || value === undefined;
  if (expr === 'not.is.null') return value !== null && value !== undefined;
  if (expr.startsWith('eq.')) return String(value) === expr.slice(3);
  if (expr.startsWith('gte.')) return String(value ?? '') >= expr.slice(4);
  if (expr.startsWith('lte.')) return String(value ?? '') <= expr.slice(4);
  if (expr.startsWith('gt.')) return String(value ?? '') > expr.slice(3);
  if (expr.startsWith('lt.')) return String(value ?? '') < expr.slice(3);
  if (expr.startsWith('like.') || expr.startsWith('ilike.')) {
    const pat = expr.slice(expr.indexOf('.') + 1).replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${pat}$`, expr.startsWith('ilike.') ? 'i' : '').test(String(value ?? ''));
  }
  if (expr.startsWith('in.')) return parseInList(expr.slice(3)).includes(String(value));
  if (expr.startsWith('not.in.')) return !parseInList(expr.slice(7)).includes(String(value));
  return true;
}

function matchRow(row, query) {
  for (const [key, raw] of Object.entries(query)) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(key)) continue;
    const exprs = Array.isArray(raw) ? raw : [raw];
    for (const expr of exprs) {
      if (!matchOp(row[key], String(expr))) return false;
    }
  }
  if (query.or) {
    const inner = String(query.or).replace(/^\(/, '').replace(/\)$/, '');
    const parts = [];
    let buf = '';
    let depth = 0;
    for (const ch of inner) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(buf);
        buf = '';
      } else buf += ch;
    }
    if (buf) parts.push(buf);
    const any = parts.some((part) => {
      const idx = part.indexOf('.');
      if (idx < 0) return false;
      const col = part.slice(0, idx);
      const expr = part.slice(idx + 1);
      return matchOp(row[col], expr);
    });
    if (!any) return false;
  }
  return true;
}

function pickSelect(rows, select, embed) {
  const mapped =
    !select || select === '*' || select.startsWith('*,')
      ? rows.map((r) => ({ ...r }))
      : rows.map((r) => {
          const cols = select.split(',').map((c) => c.trim()).filter((c) => c && !c.includes(':'));
          const out = {};
          for (const c of cols) out[c] = r[c] ?? null;
          return out;
        });
  if (!embed) return mapped;
  return mapped.map((r, i) => ({ ...r, ...embed(rows[i]) }));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, extra = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': extra.origin || '*',
    'access-control-allow-headers':
      extra.reqHeaders ||
      'authorization, apikey, content-type, x-client-info, prefer, accept, range, x-supabase-api-version, x-upsert',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
    'access-control-expose-headers': 'content-range, x-count, preference-applied',
    'cache-control': 'no-store',
    ...extra.headers,
  };
  if (extra.origin && extra.origin !== '*') headers['access-control-allow-credentials'] = 'true';
  const payload = body === undefined || body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  if (payload && extra.rangeCount !== undefined) {
    headers['content-range'] = `0-${Math.max(0, extra.rangeCount - 1)}/${extra.rangeCount}`;
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function wantsObject(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('vnd.pgrst.object+json');
}

function tableRows(name) {
  if (name === 'lawsuits') return lawsuits;
  if (name === 'profiles') return [...profiles.values()];
  if (name === 'claims') return [...claims.values()];
  if (name === 'share_links') return [];
  if (name === 'profile_facts') return [];
  if (name === 'matches') return [];
  return null;
}

function applyPatch(row, patch) {
  Object.assign(row, patch, { updated_at: nowIso() });
  return row;
}

function claimViewRow(row) {
  return {
    ...row,
    confirmation_number: row.confirmation_number ?? null,
    reported_filed_at: row.reported_filed_at ?? null,
    user_filed_on: row.user_filed_on ?? null,
    corrective_notice_answered_at: row.corrective_notice_answered_at ?? null,
    corrective_notice_required: row.corrective_notice_required === true,
  };
}

async function handleRest(req, res, url, origin) {
  const parts = url.pathname.split('/').filter(Boolean);
  // rest/v1/<table> or rest/v1/rpc/<fn>
  if (parts[0] !== 'rest' || parts[1] !== 'v1') return false;
  const query = parseQuery(url);
  const method = req.method.toUpperCase();
  const prefer = String(req.headers.prefer || '');

  if (parts[2] === 'rpc') {
    const fn = parts[3];
    const body = (await parseBody(req)) || {};
    if (fn === 'claim_start_tracking') {
      const userId = body.p_user_id;
      const lawsuitId = body.p_lawsuit_id;
      const existing = [...claims.values()].find((c) => c.user_id === userId && c.lawsuit_id === lawsuitId);
      if (existing) {
        send(res, 200, { created: false, claim: claimViewRow(existing) }, { origin });
        return true;
      }
      const row = {
        id: randomUUID(),
        user_id: userId,
        lawsuit_id: lawsuitId,
        lawsuit_title: body.p_lawsuit_title || FIXTURE.title,
        status: body.p_status || 'self_file',
        confirmation_number: null,
        reported_filed_at: null,
        user_filed_on: null,
        corrective_notice_answered_at: null,
        corrective_notice_required: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      claims.set(row.id, row);
      claimEvents.push({ claim_id: row.id, from_status: null, to_status: row.status, actor: body.p_actor });
      send(res, 200, { created: true, claim: claimViewRow(row) }, { origin });
      return true;
    }
    if (fn === 'claim_apply_change') {
      const row = claims.get(body.p_claim_id);
      if (!row || row.user_id !== body.p_user_id) {
        send(res, 400, { message: 'claim not found', code: 'P0002' }, { origin });
        return true;
      }
      if (row.status !== body.p_expected_status) {
        send(res, 400, { message: 'claim status changed', code: '40001' }, { origin });
        return true;
      }
      const changes = body.p_changes || {};
      const from = row.status;
      applyPatch(row, changes);
      claimEvents.push({
        claim_id: row.id,
        from_status: from,
        to_status: row.status,
        actor: body.p_actor,
      });
      send(res, 200, claimViewRow(row), { origin });
      return true;
    }
    send(res, 404, { message: `unknown rpc ${fn}` }, { origin });
    return true;
  }

  const table = parts[2];
  const rows = tableRows(table);
  if (!rows) {
    send(res, 404, { message: `unknown table ${table}` }, { origin });
    return true;
  }

  if (method === 'GET' || method === 'HEAD') {
    let matched = rows.filter((row) => matchRow(row, query));
    const select = String(query.select || '*');
    const embedSettlement = select.includes('settlement:lawsuits');
    let payload = pickSelect(matched, select.split(',settlement:')[0], (row) => {
      if (!embedSettlement) return {};
      const settlement = lawsuits.find((l) => l.id === row.lawsuit_id) || null;
      return { settlement };
    });
    if (query.limit) payload = payload.slice(0, Number(query.limit));
    if (wantsObject(req)) {
      if (payload.length === 0) {
        send(
          res,
          406,
          {
            code: 'PGRST116',
            details: 'The result contains 0 rows',
            hint: null,
            message: 'JSON object requested, multiple (or no) rows returned',
          },
          { origin },
        );
        return true;
      }
      send(res, 200, payload[0], { origin, rangeCount: 1 });
      return true;
    }
    send(res, 200, payload, { origin, rangeCount: payload.length });
    return true;
  }

  if (method === 'POST') {
    const body = (await parseBody(req)) || {};
    const items = Array.isArray(body) ? body : [body];
    const created = items.map((item) => {
      const row = { id: item.id || randomUUID(), ...item, created_at: nowIso(), updated_at: nowIso() };
      if (table === 'profiles') profiles.set(row.id, row);
      if (table === 'claims') claims.set(row.id, row);
      return row;
    });
    if (prefer.includes('return=representation')) {
      send(res, 201, wantsObject(req) ? created[0] : created, { origin });
    } else {
      send(res, 201, null, { origin, headers: { 'content-type': 'text/plain' } });
    }
    return true;
  }

  if (method === 'PATCH') {
    const body = (await parseBody(req)) || {};
    const matched = rows.filter((row) => matchRow(row, query));
    for (const row of matched) applyPatch(row, body);
    if (prefer.includes('return=representation')) {
      send(res, 200, wantsObject(req) ? matched[0] || null : matched, { origin });
    } else {
      res.writeHead(204, {
        'access-control-allow-origin': origin || '*',
        'cache-control': 'no-store',
      });
      res.end();
    }
    return true;
  }

  if (method === 'DELETE') {
    const matched = rows.filter((row) => matchRow(row, query));
    for (const row of matched) {
      if (table === 'profiles') profiles.delete(row.id);
      if (table === 'claims') claims.delete(row.id);
    }
    res.writeHead(204, { 'access-control-allow-origin': origin || '*' });
    res.end();
    return true;
  }

  send(res, 405, { message: 'method not allowed' }, { origin });
  return true;
}

async function handleAuth(req, res, url, origin) {
  const method = req.method.toUpperCase();
  if (!url.pathname.startsWith('/auth/v1')) return false;

  if (url.pathname === '/auth/v1/health') {
    send(res, 200, { name: 'isolated-gotrue', status: 'ok' }, { origin });
    return true;
  }
  if (url.pathname === '/auth/v1/settings') {
    send(
      res,
      200,
      { disable_signup: false, mailer_autoconfirm: true, phone_autoconfirm: true, external: {} },
      { origin },
    );
    return true;
  }
  if (url.pathname === '/auth/v1/signup' && method === 'POST') {
    const body = (await parseBody(req)) || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = body.data?.full_name || '';
    if (!email || !password) {
      send(res, 400, { error: 'invalid_request', msg: 'email and password required' }, { origin });
      return true;
    }
    if (emails.has(email)) {
      send(res, 400, { error: 'user_already_exists', msg: 'User already registered' }, { origin });
      return true;
    }
    const user = makeUser({ email, password, fullName });
    const session = issueSession(user);
    send(res, 200, session, { origin });
    return true;
  }
  if (url.pathname === '/auth/v1/token' && method === 'POST') {
    const body = (await parseBody(req)) || {};
    const grant = url.searchParams.get('grant_type') || body.grant_type;
    if (grant === 'refresh_token') {
      const userId = refresh.get(body.refresh_token);
      const user = userId ? users.get(userId) : null;
      if (!user) {
        send(res, 401, { error: 'invalid_grant', msg: 'Invalid Refresh Token' }, { origin });
        return true;
      }
      send(res, 200, issueSession(user), { origin });
      return true;
    }
    if (grant === 'password') {
      const email = String(body.email || '').trim().toLowerCase();
      const userId = emails.get(email);
      const user = userId ? users.get(userId) : null;
      if (!user || user.password !== body.password) {
        send(res, 400, { error: 'invalid_grant', msg: 'Invalid login credentials' }, { origin });
        return true;
      }
      send(res, 200, issueSession(user), { origin });
      return true;
    }
    send(res, 400, { error: 'unsupported_grant' }, { origin });
    return true;
  }
  if (url.pathname === '/auth/v1/user' && (method === 'GET' || method === 'POST')) {
    const user = userFromAuth(req);
    if (!user) {
      send(res, 401, { error: 'invalid_token', msg: 'invalid JWT' }, { origin });
      return true;
    }
    const publicUser = { ...user };
    delete publicUser.password;
    send(res, 200, publicUser, { origin });
    return true;
  }
  if (url.pathname === '/auth/v1/logout' && method === 'POST') {
    send(res, 204, null, { origin, headers: { 'content-type': 'text/plain' } });
    return true;
  }
  send(res, 404, { error: 'not_found', msg: url.pathname }, { origin });
  return true;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') {
    send(res, 204, null, { origin, reqHeaders: req.headers['access-control-request-headers'] });
    return;
  }
  let url;
  try {
    url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  } catch {
    send(res, 400, { error: 'bad url' }, { origin });
    return;
  }
  try {
    if (url.pathname === '/__isolated/health') {
      send(res, 200, { ok: true, kind: 'isolated-fixture', lawsuit: FIXTURE }, { origin });
      return;
    }
    if (url.pathname === '/__isolated/meta') {
      send(
        res,
        200,
        {
          mocked: ['GoTrue signup/session', 'PostgREST tables', 'claim RPCs'],
          real: [],
          production: false,
          lawsuit: FIXTURE,
        },
        { origin },
      );
      return;
    }
    if (await handleAuth(req, res, url, origin)) return;
    if (await handleRest(req, res, url, origin)) return;
    send(res, 404, { error: 'not_found', path: url.pathname }, { origin });
  } catch (err) {
    console.error('[isolated-backend]', err);
    send(res, 500, { error: 'fixture_error', message: err instanceof Error ? err.message : 'error' }, { origin });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`isolated-backend listening on http://${HOST}:${PORT} (fixture, not production)`);
});
