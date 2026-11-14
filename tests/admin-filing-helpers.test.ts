import { describe, expect, it, vi } from 'vitest';
import {
  apiErrorFrom,
  fetchAllPages,
  fetchStaffDocument,
  postBulkExport,
  staffJson,
  staffPaths,
  uploadEvidence,
  type Fetcher,
} from '@/components/admin/filing/api';
import { buildBulkResults } from '@/components/admin/filing/BulkConsole';
import { buildResultBody, normalizeReasonCode } from '@/components/admin/filing/DeskForms';
import { groupDeskQueue } from '@/components/admin/filing/DeskConsole';
import {
  blankSpecContent,
  checkPolicyContent,
  checkSpecContent,
  completeFieldOrder,
  defaultChannelConfig,
  defaultPolicyContent,
  issuesAt,
  moveItem,
  parseJevRulesText,
  parseStates,
  specPacketPaths,
  withQuestionType,
} from '@/components/admin/filing/forms';
import { parseConditionText } from '@/components/admin/filing/JsonFields';
import { countJobs, jobSla, slaWarnings, sortQueue } from '@/components/admin/filing/sla';
import { withValidation } from '@/components/admin/filing/SpecQuestionsEditor';
import { AGENT_CHANNELS } from '@/lib/filing/v2/contract';
import { JobListResponseSchema, RecordResultRequestSchema } from '@/lib/filing/v2/contract-staff';
import { HASH, job, NOW, POLICY_CONTENT, SPEC_CONTENT } from './admin-filing-fixtures';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

describe('SLA badges', () => {
  it('a queued job due in two days with a far deadline is on track', () => {
    expect(jobSla(job({ due_by: '2026-11-14T15:00:00.000Z', deadline: '2026-12-31' }), NOW)).toMatchObject({ level: 'ok', label: 'On track' });
  });

  it('past due_by is overdue; within a day is soon', () => {
    expect(jobSla(job({ due_by: '2026-11-12T14:00:00.000Z' }), NOW)?.level).toBe('overdue');
    const soon = jobSla(job({ due_by: '2026-11-13T02:00:00.000Z' }), NOW);
    expect(soon).toMatchObject({ level: 'soon', label: 'Due in 11 h' });
  });

  it('a deadline 3 days away or less is urgent, also for needs_attention jobs', () => {
    expect(jobSla(job({ deadline: '2026-11-15' }), NOW)).toMatchObject({ level: 'urgent', daysToDeadline: 3 });
    const attention = jobSla(job({ status: 'needs_attention', deadline: '2026-11-13' }), NOW);
    expect(attention).toMatchObject({ level: 'urgent', label: 'Needs attention, deadline tomorrow' });
    expect(jobSla(job({ status: 'needs_attention', deadline: '2026-12-31' }), NOW)?.level).toBe('attention');
  });

  it('closed jobs have no badge', () => {
    for (const status of ['filed', 'rejected', 'cancelled'] as const) expect(jobSla(job({ status }), NOW)).toBeNull();
  });

  it('warnings put the most pressing first and skip jobs on track', () => {
    const ok = job({ due_by: '2026-11-20T00:00:00.000Z', deadline: '2026-12-31' });
    const overdue = job({ due_by: '2026-11-11T00:00:00.000Z', deadline: '2026-12-31' });
    const urgent = job({ deadline: '2026-11-14' });
    const attention = job({ status: 'needs_attention', deadline: '2026-12-20' });
    expect(slaWarnings([ok, attention, overdue, urgent], NOW).map((w) => w.job.id)).toEqual([urgent.id, overdue.id, attention.id]);
  });
});

describe('queue order and counts', () => {
  it('sorts soonest deadline first, no deadline last, then due_by', () => {
    const late = job({ deadline: '2027-01-10' });
    const none = job({ deadline: null });
    const soonA = job({ deadline: '2026-12-01', due_by: '2026-11-15T00:00:00.000Z' });
    const soonB = job({ deadline: '2026-12-01', due_by: '2026-11-14T00:00:00.000Z' });
    expect(sortQueue([late, none, soonA, soonB]).map((j) => j.id)).toEqual([soonB.id, soonA.id, late.id, none.id]);
  });

  it('counts by status and channel, each job once', () => {
    const a = job({ status: 'queued' });
    const b = job({ status: 'needs_attention', channel: 'administrator_email' });
    const counts = countJobs([a, a, b, job({ status: 'filed', channel: 'administrator_bulk' })]);
    expect(counts.total).toBe(3);
    expect(counts.byStatus).toMatchObject({ queued: 1, needs_attention: 1, filed: 1, in_progress: 0 });
    expect(counts.byChannel.administrator_email).toMatchObject({ needs_attention: 1, total: 1 });
    expect(Object.keys(counts.byChannel)).toEqual([...AGENT_CHANNELS]);
  });

  it('groups the desk queue: mine, needs attention, queued, with others', () => {
    const mine = job({ status: 'in_progress', locked: true, locked_by_me: true });
    const other = job({ status: 'in_progress', locked: true });
    const attention = job({ status: 'needs_attention' });
    const queued = job();
    const groups = groupDeskQueue([queued, other, attention, mine]);
    expect(groups.mine.map((j) => j.id)).toEqual([mine.id]);
    expect(groups.others.map((j) => j.id)).toEqual([other.id]);
    expect(groups.attention.map((j) => j.id)).toEqual([attention.id]);
    expect(groups.queued.map((j) => j.id)).toEqual([queued.id]);
  });
});

describe('policy and spec helpers', () => {
  it('the default policy is the safe one: unknown, no channel', () => {
    expect(defaultPolicyContent()).toMatchObject({ agent_filing: 'unknown', channels: [], identity_check_required: false });
  });

  it('new channels start disabled', () => {
    for (const type of AGENT_CHANNELS) expect(defaultChannelConfig(type).enabled).toBe(false);
  });

  it('reports what the API would refuse, by path', () => {
    const res = checkPolicyContent({ ...POLICY_CONTENT, allowed_states: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(issuesAt(res.issues, 'allowed_states')[0]?.message).toMatch(/states the law firm covers/);
    const dup = checkPolicyContent({ ...POLICY_CONTENT, channels: [defaultChannelConfig('filing_desk'), defaultChannelConfig('filing_desk')] });
    expect(dup.ok).toBe(false);
  });

  it('a spec may not ask for PINs, codes or payout account details', () => {
    const pin = checkSpecContent({
      ...SPEC_CONTENT,
      questions: [{ ...SPEC_CONTENT.questions[0], official_label: 'Enter the PIN from your notice' }],
    });
    expect(pin.ok).toBe(false);
    const payout = checkSpecContent({
      ...SPEC_CONTENT,
      questions: [{ ...SPEC_CONTENT.questions[0], official_label: 'Your PayPal email address' }],
    });
    expect(payout.ok).toBe(false);
    expect(checkSpecContent(SPEC_CONTENT).ok).toBe(true);
  });

  it('a blank spec needs the form’s own wording before it saves', () => {
    const blank = blankSpecContent({ deadline: '2026-12-15' });
    expect(blank.member_fields).toEqual([{ field: 'legal_name', official_label: '', required: true }]);
    expect(blank.deadline).toMatchObject({ date: '2026-12-15', time_zone: 'America/New_York' });
    expect(checkSpecContent(blank).ok).toBe(false);
  });

  it('lists every packet path a spec can place and completes the order', () => {
    expect(specPacketPaths(SPEC_CONTENT).map((p) => p.path)).toEqual([
      'member.legal_name', 'member.email', 'member.address.line1', 'member.address.city', 'member.address.state', 'member.address.zip',
      'answers.item_count', 'benefit_tier', 'documents.receipt', 'payout_method',
    ]);
    const order = completeFieldOrder({ ...SPEC_CONTENT, form_field_order: ['answers.item_count', 'answers.gone'] });
    expect(order[0]).toBe('answers.item_count');
    expect(order).not.toContain('answers.gone');
    expect(order).toHaveLength(10);
  });

  it('moves list items within bounds only', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('parses states and question type changes', () => {
    expect(parseStates('ca, ny tx;CA')).toEqual(['CA', 'NY', 'TX']);
    expect(parseStates('  ')).toBeNull();
    const choice = withQuestionType(SPEC_CONTENT.questions[0], 'single_choice');
    expect(choice.options).toHaveLength(1);
    expect(withQuestionType(choice, 'text').options).toBeNull();
  });

  it('empty validation becomes null', () => {
    const q = withValidation(SPEC_CONTENT.questions[0], { min: 1 });
    expect(q.validation).toEqual({ min: 1 });
    expect(withValidation(q, { min: undefined }).validation).toBeNull();
    expect(withValidation(q, { min: Number.NaN }).validation).toBeNull();
  });

  it('checks Jev rules JSON and conditions as typed', () => {
    expect(parseJevRulesText('')).toEqual({ ok: true, rules: [] });
    const bad = parseJevRulesText('[{"id":');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0].message).toMatch(/Not valid JSON/);
    const shape = parseJevRulesText('[{"id":"x.rule","severity":"block","check":{"field":"nope","op":"present"},"message":"m","description":"d"}]');
    expect(shape.ok).toBe(false);
    const good = parseJevRulesText(
      '[{"id":"kroger.max_items","description":"Tier rule","severity":"block","check":{"field":"answers.item_count","op":"lte","value":5},"message":"Up to 5 items."}]',
    );
    expect(good.ok && good.rules[0].audience).toBe('member');
    expect(parseConditionText('')).toEqual({ ok: true, value: null });
    expect(parseConditionText('{"field":"benefit_tier","op":"eq","value":"with_proof"}').ok).toBe(true);
    expect(parseConditionText('{"field":"benefit_tier","op":"eval"}').ok).toBe(false);
  });
});

describe('desk and bulk bodies', () => {
  it('normalizes reason codes to lowercase identifiers', () => {
    expect(normalizeReasonCode('Proof Unreadable!')).toBe('proof_unreadable');
    expect(normalizeReasonCode('site-error after submit')).toBe('site_error_after_submit');
  });

  it('builds a result body the contract accepts', () => {
    const filed = buildResultBody({ outcome: 'filed', confirmationNumber: ' CN-1 ', evidenceIds: [HASH.slice(0, 8)], reasonCode: 'x', challenge: 'captcha', notes: ' ' });
    expect(filed).toMatchObject({ outcome: 'filed', confirmation_number: 'CN-1', reason_code: 'x', notes: null });
    const challenge = buildResultBody({ outcome: 'stopped_at_challenge', confirmationNumber: 'CN', evidenceIds: ['e'], reasonCode: '', challenge: 'sms_code', notes: '' });
    expect(challenge).toMatchObject({ confirmation_number: null, evidence_document_ids: [], reason_code: 'sms_code' });
    expect(RecordResultRequestSchema.safeParse(challenge).success).toBe(true);
    const needsAttention = buildResultBody({ outcome: 'needs_attention', confirmationNumber: '', evidenceIds: [], reasonCode: '', challenge: 'captcha', notes: '' });
    expect(RecordResultRequestSchema.safeParse(needsAttention).success).toBe(false);
  });

  it('sends only bulk rows with an outcome', () => {
    const body = buildBulkResults({
      a: { outcome: 'filed', confirmationNumber: ' 123 ', reasonCode: 'ignored' },
      b: { outcome: '', confirmationNumber: '', reasonCode: '' },
      c: { outcome: 'rejected', confirmationNumber: 'ignored', reasonCode: 'duplicate_claim' },
    });
    expect(body.results).toEqual([
      { job_id: 'a', outcome: 'filed', confirmation_number: '123', reason_code: null },
      { job_id: 'c', outcome: 'rejected', confirmation_number: null, reason_code: 'duplicate_claim' },
    ]);
  });
});

describe('staff API client', () => {
  it('maps error bodies and statuses to contract codes and messages', () => {
    expect(apiErrorFrom(409, { error: 'Only a draft can be changed. Start a new draft.', code: 'not_draft' })).toMatchObject({ code: 'not_draft', status: 409 });
    expect(apiErrorFrom(403, null)).toMatchObject({ code: 'forbidden', message: 'You don’t have access to this.' });
    expect(apiErrorFrom(429, { code: 'rate_limited' }, '30').retryAfter).toBe(30);
    expect(apiErrorFrom(500, 'oops').code).toBe('service_unavailable');
  });

  it('builds encoded paths and queries', () => {
    expect(staffPaths.jobs({ status: 'queued', channel: 'filing_desk', cursor: null, limit: 100 })).toBe('/api/admin/filing/jobs?status=queued&channel=filing_desk&limit=100');
    expect(staffPaths.settlements({ q: 'a&b', filter: 'all' })).toBe('/api/admin/filing/settlements?q=a%26b&filter=all');
    expect(staffPaths.bulkResults('x/y')).toBe('/api/admin/filing/bulk/exports/x%2Fy/results');
  });

  it('sends JSON with the cookie session and refuses answers that do not match the contract', async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ items: 'nope' }));
    const res = await staffJson('/api/admin/filing/jobs', JobListResponseSchema, { method: 'POST', body: { a: 1 }, fetcher });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('bad_response');
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', body: '{"a":1}' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('a network failure is an error, never a throw', async () => {
    const res = await staffJson('/x', JobListResponseSchema, { fetcher: async () => Promise.reject(new Error('offline')) });
    expect(res.ok === false && res.error.code).toBe('network_error');
  });

  it('follows cursors up to the page cap', async () => {
    const pages = vi.fn(async (cursor: string | null) => ({
      ok: true as const,
      status: 200,
      data: { items: [cursor ?? 'first'], next_cursor: `${cursor ?? ''}n` },
    }));
    const res = await fetchAllPages(pages, 3);
    expect(res).toEqual({ ok: true, items: ['first', 'n', 'nn'], capped: true });
  });

  it('reads the bulk export headers and keeps the file name safe', async () => {
    const batch = '00000000-0000-4000-8000-000000000301';
    const fetcher: Fetcher = async () =>
      new Response('a,b\n1,2\n', {
        status: 200,
        headers: { 'content-type': 'text/csv', 'x-export-batch-id': batch, 'x-export-rows': '1', 'x-export-sha256': HASH, 'content-disposition': 'attachment; filename="../evil.csv"' },
      });
    const res = await postBulkExport({ lawsuit_id: batch, confirm: true }, fetcher);
    expect(res.ok && res.data).toMatchObject({ batchId: batch, rows: 1, sha256: HASH, fileName: `lawsuitai-$1-${batch}.csv` });
    const missing = await postBulkExport({ lawsuit_id: batch, confirm: true }, async () => new Response('x', { status: 200 }));
    expect(missing.ok).toBe(false);
  });

  it('reads a document as a link or as the file', async () => {
    const link = await fetchStaffDocument('d', async () => jsonResponse({ url: 'https://storage.example.test/signed?token=1', expires_at: '2026-11-12T15:05:00Z' }));
    expect(link.ok && link.data).toEqual({ kind: 'url', url: 'https://storage.example.test/signed?token=1' });
    const file = await fetchStaffDocument('d', async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'image/png' } }));
    expect(file.ok && file.data.kind).toBe('blob');
    const script = await fetchStaffDocument('d', async () => jsonResponse({ url: 'javascript:alert(1)' }));
    expect(script.ok).toBe(false);
  });

  it('evidence: only PNG, JPG or PDF up to 10 MB, uploaded without upsert', async () => {
    const wrong = await uploadEvidence('job', new Blob(['x'], { type: 'image/gif' }), async () => jsonResponse({}));
    expect(wrong.ok === false && wrong.error.code).toBe('document_invalid');
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetcher: Fetcher = async (url, init) => {
      calls.push([url, init]);
      if (url.endsWith('/evidence')) {
        return jsonResponse({ document: { id: '00000000-0000-4000-8000-000000000401' }, upload: { signed_url: 'https://storage.example.test/upload/sign/x?token=t', token: 't', path: 'x' } });
      }
      return new Response(null, { status: 200 });
    };
    const ok = await uploadEvidence('job', new Blob(['png'], { type: 'image/png' }), fetcher);
    expect(ok.ok && ok.data.documentId).toBe('00000000-0000-4000-8000-000000000401');
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ mime: 'image/png', size_bytes: 3 });
    expect(calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' } });
  });
});
