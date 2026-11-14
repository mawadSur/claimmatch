import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// The console parses every staff answer with the contract's schemas
// (src/components/admin/filing/api.ts), so the views must match them exactly.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));

import { settlementSummaries } from '@/app/api/admin/filing/_lib/settlements';
import { auditView, controlsView, policyView, roleView, specView } from '@/app/api/admin/filing/_lib/views';
import { buildDeskView } from '@/lib/filing/channels/desk';
import type { JobContext } from '@/lib/filing/channels/context';
import {
  AuditEntryViewSchema,
  ControlsViewSchema,
  DeskPacketViewSchema,
  PolicyRecordViewSchema,
  RoleViewSchema,
  SettlementFilingSummarySchema,
  SpecRecordViewSchema,
} from '@/lib/filing/v2/contract-staff';
import { FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TS = '2026-11-12T10:00:00.123456+00:00';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare it is true.' },
  member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
  form_field_order: ['member.legal_name'],
});
const POLICY_ROW = {
  id: ID(6), lawsuit_id: ID(2), administrator_id: null, version: 3, status: 'approved', agent_filing: 'allowed',
  channels: [{ type: 'filing_desk', enabled: true }], agent_certification_allowed: false, allowed_states: ['CA'],
  health_sensitive: false, health_consent_text: null, identity_check_required: false, sources_reviewed: [], notes: null,
  created_by: ID(40), created_at: TS, updated_by: ID(41), updated_at: TS, approved_by: ID(41), approved_at: TS,
  approval_notes: 'Reviewed.', documents_reviewed: [{ kind: 'claim_form', title: 'Form', url: null, document_ref: null, reviewed_on: '2026-11-10', notes: null }],
  rejected_by: null, rejected_at: null, rejection_notes: null,
};

describe('staff views match the contract', () => {
  it('policies, specs, controls, roles and audit entries', () => {
    expect(PolicyRecordViewSchema.safeParse(policyView(POLICY_ROW)).success).toBe(true);
    const spec = { id: ID(3), lawsuit_id: ID(2), version: 1, status: 'draft', content: SPEC, created_by: ID(40), created_at: TS, updated_by: null, updated_at: TS, approved_by: null, approved_at: null, approval_notes: null, documents_reviewed: null, retired_at: null, retire_reason: null };
    expect(SpecRecordViewSchema.safeParse(specView(spec)).success).toBe(true);
    const controls = { id: ID(8), lawsuit_id: ID(2), administrator_id: null, kill_switch: true, kill_switch_reason: 'Objection call', kill_switch_changed_at: TS, objection_received_at: null, objection_notes: null };
    expect(ControlsViewSchema.parse(controlsView(controls))).toMatchObject({ target: { lawsuit_id: ID(2) }, kill_switch: true });
    expect(ControlsViewSchema.parse(controlsView({ ...controls, lawsuit_id: null, administrator_id: ID(9) })).target).toEqual({ administrator_id: ID(9) });
    expect(RoleViewSchema.safeParse(roleView({ id: ID(10), user_id: ID(41), role: 'legal_reviewer', granted_by: null, granted_at: TS }, 'counsel@firm.test')).success).toBe(true);
    expect(AuditEntryViewSchema.safeParse(auditView({ id: ID(11), actor_id: ID(40), actor_roles: ['admin'], action: 'view_packet', subject_user_id: ID(30), claim_id: ID(1), job_id: null, lawsuit_id: ID(2), detail: {}, created_at: TS })).success).toBe(true);
  });

  it('the desk screen', () => {
    const packet = {
      format: 'claimmatch.packet.v1', claim_id: ID(1), lawsuit_id: ID(2), spec: { id: ID(3), version: 1 },
      member: { legal_name: 'Ada Lovelace', first_name: null, last_name: null, email: 'ada@example.test', phone: null, address: { line1: '1 Main', line2: null, city: 'X', state: 'CA', zip: '94110' } },
      answers: {}, benefit_tier: null, payout_method: null, documents: [], confirmations: { class_definition: true, health_data_consent: null },
      class_definition_sha256: sha('All buyers.'), attestation_sha256: sha('I declare it is true.'),
    };
    const ctx = {
      job: { id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), channel: 'filing_desk', status: 'in_progress', attempt: 1, due_by: TS, lock_owner: `staff:${ID(40)}`, lock_expires_at: TS, needs_attention_reason: null, created_at: TS },
      claim: { id: ID(1), user_id: ID(30), lawsuit_id: ID(2), status: 'filing' },
      signature: { signature_id: ID(5), typed_name: 'Ada Lovelace', signed_at: TS, packet_hash: 'b'.repeat(64), statement_text: 'I declare it is true.', authorization_text_version: 'agent-auth-v1', lane: 'filing_desk', statement_sha256: sha('I declare it is true.'), voided: false },
      packet,
      packetRow: { id: ID(4), status: 'signed', health_consent_text_sha256: null },
      spec: { id: ID(3), lawsuit_id: ID(2), version: 1, status: 'approved', content: SPEC },
      settlement: { lawsuit: { id: ID(2), slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31', claim_url: null, administrator_id: null, third_party_fee_status: 'unknown' }, administrator: null, policy: { channels: [] }, approvedSpec: null },
      documents: [],
    } as unknown as JobContext;
    const view = buildDeskView(ctx, { outcome: 'pass', issues: [] } as never, { id: ID(40), email: null, isAdmin: false, roles: ['filing_agent'] });
    const parsed = DeskPacketViewSchema.safeParse(view);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });

  it('the settlement overview', async () => {
    const tables: Record<string, unknown[]> = {
      filing_policies: [POLICY_ROW],
      filing_specs: [{ id: ID(3), lawsuit_id: ID(2), version: 1, status: 'approved', content: SPEC }],
      claim_filing_jobs: [{ lawsuit_id: ID(2) }],
    };
    const svc = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const name of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) chain[name] = () => chain;
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: tables[table] ?? [], error: null, count: 3 }).then(resolve, reject);
        return chain;
      },
    } as never;
    const rows = [{ id: ID(2), slug: 'acme', title: 'Acme', status: 'open', review_status: 'published', deadline: '2026-12-31', claim_url: null, administrator_id: null, third_party_fee_status: 'unknown' }];
    const [summary] = await settlementSummaries(svc, rows, new Date('2026-11-12T15:00:00Z'));
    const parsed = SettlementFilingSummarySchema.safeParse(summary);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    expect(summary).toMatchObject({ agent_filing: 'allowed', channels_enabled: ['filing_desk'], lane_preview: 'filing_desk', open_jobs: 1, policy: { approved_version: 3, draft_version: null } });
  });
});
