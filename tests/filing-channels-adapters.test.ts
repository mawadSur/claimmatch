import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Resend is never called: src/lib/email-transactional.ts's sender is mocked.
const mail = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  answer: { status: 'sent', id: 'msg_1' } as { status: string; id?: string; error?: string },
}));
vi.mock('@/lib/email-transactional', () => ({
  sendTransactionalEmail: async (m: Record<string, unknown>) => {
    mail.calls.push(m);
    return mail.answer;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));

import { registerAdministratorAdapter, UnsupportedAdministratorAdapter } from '@/lib/administrators/adapters';
import { headerSafe, renderAdministratorEmail, submitAdministratorEmail } from '@/lib/filing/channels/administrator-email';
import { submitAdministratorApi } from '@/lib/filing/channels/administrator-api';
import { buildBulkCsv, bulkFileName, csvCell } from '@/lib/filing/channels/bulk';
import { buildDeskView, jobSummary } from '@/lib/filing/channels/desk';
import { orderedPacketFields } from '@/lib/filing/channels/packet-fields';
import type { JobContext } from '@/lib/filing/channels/context';
import type { ChannelDocument, ChannelSubmitInput, FilingJobRecord } from '@/lib/filing/channels/types';
import type { CanonicalPacket } from '@/lib/filing/v2/contract';
import { AdministratorBulkConfigSchema, AdministratorEmailConfigSchema, FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PDF = new TextEncoder().encode('%PDF-1.7 receipt bytes');

const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All persons who bought the product.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare under penalty of perjury\nthat the above is true.' },
  member_fields: [
    { field: 'legal_name', official_label: 'Claimant Name', required: true },
    { field: 'address.line1', official_label: 'Street', required: true },
    { field: 'address.zip', official_label: 'ZIP', required: true },
    { field: 'email', official_label: 'Email', required: true },
  ],
  questions: [
    { key: 'purchase_count', official_label: 'How many did you buy?', type: 'integer', required: true },
    { key: 'store', official_label: 'Where?', type: 'single_choice', required: false, options: [{ value: 'online', official_label: 'Online store' }] },
    { key: 'kept_it', official_label: 'Do you still have it?', type: 'yes_no', required: false },
  ],
  benefit_tiers: [{ key: 'documented', official_label: 'With receipt', proof: [{ kind: 'receipt', official_label: 'Proof of purchase', required: true }] }],
  payout_options: [{ value: 'check', official_label: 'Paper check' }],
  form_field_order: ['answers.purchase_count', 'member.legal_name', 'documents.receipt', 'payout_method', 'member.address.zip'],
  desk_notes: 'Use the long form.',
});

const PACKET: CanonicalPacket = {
  format: 'claimmatch.packet.v1',
  claim_id: ID(1),
  lawsuit_id: ID(2),
  spec: { id: ID(3), version: 1 },
  member: {
    legal_name: 'Ada <b>Lovelace</b>',
    first_name: null,
    last_name: null,
    email: 'ada@member.example.test',
    phone: null,
    address: { line1: '1 Main St', line2: null, city: 'Springfield', state: 'CA', zip: '94110' },
  },
  answers: { purchase_count: 3, store: 'online', kept_it: false },
  benefit_tier: 'documented',
  payout_method: 'check',
  documents: [{ id: ID(9), kind: 'receipt', sha256: sha(PDF), mime: 'application/pdf', size_bytes: PDF.byteLength }],
  confirmations: { class_definition: true, health_data_consent: null },
  class_definition_sha256: sha(SPEC.class_definition.text),
  attestation_sha256: sha(SPEC.attestation.text),
};

const JOB: FilingJobRecord = {
  id: ID(20),
  claim_id: ID(1),
  user_id: ID(30),
  lawsuit_id: ID(2),
  packet_id: ID(4),
  signature_id: ID(5),
  packet_hash: 'a'.repeat(64),
  policy_id: ID(6),
  spec_id: ID(3),
  channel: 'administrator_email',
  status: 'in_progress',
  idempotency_key: `sig:${ID(5)}`,
  attempt: 1,
  run_after: '2026-11-12T00:00:00Z',
  due_by: null,
  locked_at: '2026-11-12T10:00:00Z',
  lock_owner: 'worker:run-1',
  lock_expires_at: '2026-11-12T10:15:00Z',
  export_batch_id: null,
  confirmation_number: null,
  result: {},
  evidence: [],
  needs_attention_reason: null,
  closed_reason: null,
  filed_at: null,
  closed_at: null,
  created_at: '2026-11-12T09:00:00Z',
  updated_at: '2026-11-12T10:00:00Z',
};

const SIGNATURE = {
  signature_id: ID(5),
  typed_name: 'Ada Lovelace',
  signed_at: '2026-11-12T15:04:05.000Z',
  packet_hash: 'a'.repeat(64),
  statement_text: SPEC.attestation.text,
  authorization_text_version: 'agent-auth-v1',
  lane: 'administrator_email' as const,
};

function doc(bytes: Uint8Array, over: Partial<ChannelDocument> = {}): ChannelDocument {
  return { id: ID(9), kind: 'receipt', official_label: 'receipt', mime: 'application/pdf', size_bytes: bytes.byteLength, sha256: sha(PDF), read: async () => bytes, ...over };
}

function emailInput(over: Partial<ChannelSubmitInput<'administrator_email'>> = {}): ChannelSubmitInput<'administrator_email'> {
  return {
    job: JOB,
    config: AdministratorEmailConfigSchema.parse({
      type: 'administrator_email',
      enabled: true,
      to: 'claims@admin.example.test',
      cc: ['records@admin.example.test'],
      published_at_url: 'https://admin.example.test/contact',
    }),
    spec: { id: ID(3), version: 1, content: SPEC },
    packet: PACKET,
    signature: SIGNATURE,
    documents: [doc(PDF)],
    settlement: { id: ID(2), title: 'Acme Widgets Settlement\r\nBcc: thief@evil.example', deadline: '2026-12-31' },
    now: new Date('2026-11-13T12:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  mail.calls = [];
  mail.answer = { status: 'sent', id: 'msg_1' };
});
afterEach(() => vi.restoreAllMocks());

describe('administrator_email', () => {
  it('sends one email with the answers in the official order, the signature block and the re-hashed proof', async () => {
    const out = await submitAdministratorEmail(emailInput());
    expect(out.status).toBe('filed');
    expect(mail.calls).toHaveLength(1);
    const sent = mail.calls[0] as { to: string; cc: string[]; subject: string; html: string; text: string; attachments: Array<{ filename: string; content: string; contentType: string }>; idempotencyKey: string };
    expect(sent.to).toBe('claims@admin.example.test');
    expect(sent.cc).toEqual(['ada@member.example.test', 'records@admin.example.test']);
    expect(sent.idempotencyKey).toBe(JOB.idempotency_key);
    expect(sent.attachments).toEqual([{ filename: 'receipt-1.pdf', content: Buffer.from(PDF).toString('base64'), contentType: 'application/pdf' }]);
    const order = ['How many did you buy?: 3', 'Claimant Name: Ada <b>Lovelace</b>', 'Payment method: Paper check', 'ZIP: 94110'];
    const positions = order.map((line) => sent.text.indexOf(line));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(sent.text).toContain('Where?: Online store');
    expect(sent.text).toContain('Do you still have it?: No');
    expect(sent.text).toContain('Signature: /s/ Ada Lovelace');
    expect(sent.text).toContain('2026-11-12 15:04:05 UTC');
    expect(sent.text).toContain(`SHA-256 of the signed claim record: ${'a'.repeat(64)}`);
    expect(sent.text).toContain('I declare under penalty of perjury\nthat the above is true.');
    expect(sent.text).toContain('belongs to the claimant');
    if (out.status === 'filed') {
      expect(out.confirmation_number).toBeNull();
      expect(out.evidence[0]).toMatchObject({ kind: 'email', provider: 'resend', provider_message_id: 'msg_1', attachment_sha256s: [sha(PDF)] });
    }
  });

  it('guards headers and the HTML: no line breaks in the subject, markup escaped', async () => {
    await submitAdministratorEmail(emailInput());
    const sent = mail.calls[0] as { subject: string; html: string };
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.subject).toBe('Claim form: Acme Widgets Settlement Bcc: thief@evil.example - Ada <b>Lovelace</b>');
    expect(sent.html).toContain('Ada &lt;b&gt;Lovelace&lt;/b&gt;');
    expect(sent.html).not.toContain('<b>Lovelace</b>');
    expect(headerSafe('a b\u0000c\n\nd', 10)).toBe('a b c d');
  });

  it('never sends bytes that differ from the signed packet', async () => {
    const out = await submitAdministratorEmail(emailInput({ documents: [doc(new TextEncoder().encode('%PDF- swapped'))] }));
    expect(out).toMatchObject({ status: 'needs_attention', reason_code: 'document_hash_mismatch' });
    expect(mail.calls).toHaveLength(0);
  });

  it('refuses proof it cannot attach, and attachments over the limit', async () => {
    const noAttach = emailInput();
    noAttach.config = { ...noAttach.config, attach_documents: false };
    expect(await submitAdministratorEmail(noAttach)).toMatchObject({ status: 'needs_attention', reason_code: 'documents_not_carried' });
    const small = emailInput();
    small.config = { ...small.config, max_total_attachment_bytes: 5 };
    expect(await submitAdministratorEmail(small)).toMatchObject({ status: 'needs_attention', reason_code: 'attachments_too_large' });
    expect(mail.calls).toHaveLength(0);
  });

  it('a file that cannot be read is retried only while nothing was sent, then a person looks', async () => {
    const failing = [doc(PDF, { read: async () => Promise.reject(new Error('storage down')) })];
    expect(await submitAdministratorEmail(emailInput({ documents: failing }))).toEqual({ status: 'not_sent', reason_code: 'document_unreadable', retry_safe: true });
    expect(await submitAdministratorEmail(emailInput({ documents: failing, job: { ...JOB, attempt: 3 } }))).toMatchObject({ status: 'needs_attention' });
    expect(mail.calls).toHaveLength(0);
  });

  it('is not sent (safe to retry) without Resend, and never re-sent after Resend was called', async () => {
    mail.answer = { status: 'not_configured' };
    expect(await submitAdministratorEmail(emailInput())).toEqual({ status: 'not_sent', reason_code: 'email_not_configured', retry_safe: true });
    mail.answer = { status: 'failed', error: 'internal_server_error' };
    expect(await submitAdministratorEmail(emailInput())).toMatchObject({ status: 'needs_attention', reason_code: 'email_send_failed' });
  });

  it('refuses a configured address that could break a header', async () => {
    const bad = emailInput();
    bad.config = { ...bad.config, cc: ['ok@admin.example.test, evil@x.example'] };
    expect(await submitAdministratorEmail(bad)).toMatchObject({ status: 'needs_attention', reason_code: 'channel_config_invalid' });
  });

  it('renders the same answers as the desk', () => {
    const rendered = renderAdministratorEmail({
      settlementTitle: 'Acme',
      packet: PACKET,
      spec: SPEC,
      signature: SIGNATURE,
      reference: JOB.id,
      subjectPrefix: '[Lawsuit AI]',
      attachments: [],
    });
    expect(rendered.subject.startsWith('[Lawsuit AI] Claim form: Acme')).toBe(true);
    for (const f of orderedPacketFields(PACKET, SPEC)) expect(rendered.text).toContain(`${f.label}: ${f.text}`);
  });
});

describe('administrator_bulk CSV', () => {
  it('keeps every cell that starts like a formula as text, and quotes per RFC 4180', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('-3')).toBe("'-3");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('\rx')).toBe(`"'\rx"`);
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1,"2"')).toBe(`"'=1,""2"""`);
    expect(csvCell(null)).toBe('');
  });

  it('writes the administrator’s columns in order, one row per signed claim', () => {
    const config = AdministratorBulkConfigSchema.parse({
      type: 'administrator_bulk',
      enabled: true,
      columns: [
        { header: 'Claimant', source: { path: 'member.legal_name' } },
        { header: 'Items', source: { path: 'answers.purchase_count' } },
        { header: 'Store', source: { path: 'answers.store' } },
        { header: 'Payment', source: { path: 'payout_method' } },
        { header: 'Signed by', source: { signature: 'typed_name' } },
        { header: 'Signed at', source: { signature: 'signed_at' } },
        { header: 'Ref', source: { claim: 'reference' } },
        { header: 'Filer', source: { constant: '=Lawsuit AI' } },
      ],
    });
    const { csv, columns } = buildBulkCsv(config, [
      { jobId: JOB.id, claimId: JOB.claim_id, packet: PACKET, spec: SPEC, signature: { id: ID(5), typed_name: 'Ada Lovelace', signed_at: SIGNATURE.signed_at, packet_hash: 'a'.repeat(64) } },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Claimant,Items,Store,Payment,Signed by,Signed at,Ref,Filer',
      `Ada <b>Lovelace</b>,3,Online store,Paper check,Ada Lovelace,${SIGNATURE.signed_at},${JOB.id},'=Lawsuit AI`,
      '',
    ]);
    expect(columns[0]).toEqual({ header: 'Claimant', source: { path: 'member.legal_name' } });
    expect(bulkFileName('claimmatch', 'acme/../settlement', ID(77), new Date('2026-11-13T00:00:00Z'))).toBe('claimmatch-acme-settlement-2026-11-13-00000000.csv');
  });
});

describe('administrator_api', () => {
  const apiInput = (adapter: string) =>
    ({ ...emailInput(), job: { ...JOB, channel: 'administrator_api' }, config: { type: 'administrator_api', enabled: true, adapter, min_days_before_deadline: 3 } }) as unknown as ChannelSubmitInput<'administrator_api'>;

  it('goes to a person while no adapter is registered (every adapter today)', async () => {
    expect(await submitAdministratorApi(apiInput('jnd'))).toMatchObject({ status: 'needs_attention', reason_code: 'adapter_unsupported' });
  });

  it('records a registered adapter’s answer, and a throw as needs_attention (never retried)', async () => {
    // Registered adapters that are not the unsupported default (none exists in the product).
    registerAdministratorAdapter({ slug: 'test-ok', filingMethod: 'api', submit: async () => ({ status: 'accepted', administratorClaimId: 'ADM-9' }) });
    registerAdministratorAdapter({
      slug: 'test-throws',
      filingMethod: 'api',
      submit: async () => {
        throw new Error('socket hang up');
      },
    });
    expect(new UnsupportedAdministratorAdapter('x')).toBeInstanceOf(UnsupportedAdministratorAdapter);
    expect(await submitAdministratorApi(apiInput('test-ok'))).toMatchObject({ status: 'filed', confirmation_number: 'ADM-9' });
    expect(await submitAdministratorApi(apiInput('test-throws'))).toMatchObject({ status: 'needs_attention', reason_code: 'adapter_error' });
  });
});

describe('the desk screen', () => {
  it('lists the signed packet in form_field_order with copy text, then the rest', () => {
    const fields = orderedPacketFields(PACKET, SPEC);
    expect(fields.map((f) => f.path)).toEqual([
      'answers.purchase_count',
      'member.legal_name',
      'payout_method',
      'member.address.zip',
      'member.email',
      'member.address.line1',
      'member.address.city',
      'member.address.state',
      'answers.store',
      'answers.kept_it',
      'benefit_tier',
    ]);
    expect(fields.find((f) => f.path === 'member.address.city')).toMatchObject({ label: 'City', text: 'Springfield', required: false });
    expect(fields.find((f) => f.path === 'benefit_tier')).toMatchObject({ text: 'With receipt' });
  });

  it('shows the lock, the checks (staff issues included) and the instructions; nothing opens the official site', () => {
    const staff = { id: ID(40), email: null, isAdmin: false, roles: ['filing_agent' as const] };
    const ctx = {
      job: { ...JOB, channel: 'filing_desk', lock_owner: `staff:${ID(40)}` },
      claim: { id: ID(1), user_id: ID(30), lawsuit_id: ID(2), status: 'filing' },
      signature: { ...SIGNATURE, lane: 'filing_desk', statement_sha256: sha(SPEC.attestation.text), voided: false },
      packet: PACKET,
      packetRow: { id: ID(4), status: 'signed', health_consent_text_sha256: null },
      spec: { id: ID(3), lawsuit_id: ID(2), version: 1, status: 'approved', content: SPEC },
      settlement: {
        lawsuit: { id: ID(2), slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31', claim_url: null, administrator_id: null, third_party_fee_status: 'unknown' },
        administrator: null,
        policy: { channels: [{ type: 'filing_desk', enabled: true, daily_capacity: 10, sla_business_days: 2, min_days_before_deadline: 5, accepts_documents: true, instructions: 'Desk steps.' }] },
        approvedSpec: null,
      },
      documents: [],
    } as unknown as JobContext;
    const jev = { outcome: 'warn', issues: [{ rule_id: 'global.duplicate_identity', source: 'global', severity: 'warn', code: 'duplicate_identity', message: 'Same identity elsewhere', field: null, audience: 'staff' }] } as never;
    const view = buildDeskView(ctx, jev, staff);
    expect(view.lock).toEqual({ mine: true, expires_at: JOB.lock_expires_at });
    expect(view.instructions).toBe('Desk steps.\n\nUse the long form.');
    expect(view.checks.issues[0].audience).toBe('staff');
    expect(view.settlement.official_form_url).toBe('https://official.example.test/claim');
    expect(view.documents).toEqual([{ id: ID(9), kind: 'receipt', label: 'Proof of purchase', mime: 'application/pdf', size_bytes: PDF.byteLength, sha256: sha(PDF) }]);
    expect(jobSummary({ ...JOB, status: 'queued', lock_owner: null }, { settlementTitle: 'Acme', deadline: null }, staff)).toMatchObject({ locked: false, locked_by_me: false });
  });
});
