import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Transactional notices to the member. Resend is never called.
const h = vi.hoisted(() => ({
  sent: [] as Array<Record<string, unknown>>,
  rows: {} as Record<string, Record<string, unknown> | null>,
}));
vi.mock('@/lib/email-transactional', () => ({
  sendTransactionalEmail: async (mail: Record<string, unknown>) => {
    h.sent.push(mail);
    return { status: 'sent', id: 'msg' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: h.rows[table] ?? null, error: null });
      return chain;
    },
  }),
}));

import { noticeCopy, notifyMember, renderNotice, type MemberNoticeKind } from '@/lib/filing/channels/member-notices';
import { FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const KINDS: MemberNoticeKind[] = ['queued', 'filed', 'needs_you', 'not_accepted', 'handed_back'];
const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare it is true.' },
  member_fields: [{ field: 'legal_name', official_label: 'Full Name', required: true }],
  questions: [{ key: 'purchase_count', official_label: 'How many?', type: 'integer', required: true }],
});
const PACKET = {
  format: 'claimmatch.packet.v1',
  claim_id: ID(1),
  lawsuit_id: ID(2),
  spec: { id: ID(3), version: 1 },
  member: { legal_name: 'Ada Lovelace', first_name: null, last_name: null, email: 'ada@example.test', phone: null, address: { line1: '1 Main', line2: null, city: 'X', state: 'CA', zip: '94110' } },
  answers: { purchase_count: 2 },
  benefit_tier: null,
  payout_method: null,
  documents: [],
  confirmations: { class_definition: true, health_data_consent: null },
  class_definition_sha256: sha('All buyers.'),
  attestation_sha256: sha('I declare it is true.'),
};

beforeEach(() => {
  h.sent = [];
  h.rows = {
    profiles: { email: 'ada@example.test' },
    lawsuits: { title: 'Acme <Widgets>', slug: 'acme', deadline: '2026-12-31' },
    claim_signatures: { packet_canonical: JSON.stringify(PACKET), typed_name: 'Ada Lovelace', signed_at: '2026-11-12T15:04:05Z', statement_text: 'I declare it is true.', spec_id: ID(3) },
    filing_specs: { content: SPEC },
  };
});

describe('notice copy', () => {
  it.each(KINDS)('%s: plain, no promise of payment, never claims Lawsuit AI decides', (kind) => {
    const copy = noticeCopy(kind, { title: 'Acme', slug: 'acme', deadline: '2026-12-31', confirmationNumber: null });
    const all = [copy.subject, copy.heading, ...copy.paragraphs].join(' ').toLowerCase();
    expect(all).not.toMatch(/autopilot|guarantee|you will be paid|on your behalf|we file|we submit|filed by|submitted by/);
    expect(copy.cta.url).toBe('https://lawsuitai.org/claim/acme');
  });

  it('tells the member why a claim came back when the deadline is the reason', () => {
    expect(noticeCopy('handed_back', { title: 'Acme', slug: 'acme', deadline: '2026-12-31', confirmationNumber: null, reason: 'deadline_too_close' }).paragraphs[0]).toMatch(/too close/);
    expect(noticeCopy('handed_back', { title: 'Acme', slug: 'acme', deadline: null, confirmationNumber: null, reason: 'not_offered_for_settlement' }).paragraphs.join(' ')).not.toMatch(/deadline is/);
    expect(noticeCopy('filed', { title: 'Acme', slug: 'acme', deadline: null, confirmationNumber: 'ADM-7' }).paragraphs[1]).toContain('ADM-7');
  });

  it('escapes what it shows', () => {
    const { html } = renderNotice({ ...noticeCopy('needs_you', { title: '<script>x</script>', slug: 'a', deadline: null, confirmationNumber: null }) });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('notifyMember', () => {
  it('sends the queued notice with an exact copy of what was signed, once per event', async () => {
    expect(await notifyMember({ kind: 'queued', claimId: ID(1), userId: ID(30), lawsuitId: ID(2), eventId: ID(20), signatureId: ID(5) })).toBe(true);
    expect(h.sent).toHaveLength(1);
    const mail = h.sent[0] as { to: string; subject: string; text: string; idempotencyKey: string };
    expect(mail.to).toBe('ada@example.test');
    expect(mail.idempotencyKey).toBe(`notice:queued:${ID(20)}`);
    expect(mail.subject).toBe('Your signed claim for Acme <Widgets> is in line');
    expect(mail.text).toContain('Full Name: Ada Lovelace');
    expect(mail.text).toContain('How many?: 2');
    expect(mail.text).toContain('I declare it is true.');
    expect(mail.text).toContain('Signed by: Ada Lovelace');
  });

  it('sends nothing without an account email, and never throws', async () => {
    h.rows.profiles = { email: null };
    expect(await notifyMember({ kind: 'filed', claimId: ID(1), userId: ID(30), lawsuitId: ID(2), eventId: 'e' })).toBe(false);
    h.rows.profiles = null;
    h.rows.lawsuits = null;
    expect(await notifyMember({ kind: 'filed', claimId: ID(1), userId: ID(30), lawsuitId: ID(2), eventId: 'e' })).toBe(false);
    expect(h.sent).toEqual([]);
  });
});
