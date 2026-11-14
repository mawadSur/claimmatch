import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JevConditionSchema, JevRuleSchema } from '@/lib/jev/types';
import {
  AGENT_CLAIM_STATUSES,
  CLAIM_TRANSITIONS,
  CanonicalPacketSchema,
  FILING_DB_ERRORS,
  FILING_ERROR_CODES,
  FILING_ERROR_HTTP,
  FILING_ERROR_MESSAGES,
  FRESH_SIGN_IN_METHODS,
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  REAUTH_MAX_AGE_SECONDS,
  SignRequestSchema,
  UpdatePacketRequestSchema,
  canMoveClaim,
  normalizeTypedName,
} from '@/lib/filing/v2/contract';
import { RecordResultRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canGrantStaffRole, canManageStaffRoles, requestIpForRecord, type StaffUser } from '@/lib/staff-roles';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));

// The one-click contract (docs/designs/one-click-filing.md): the TypeScript
// copy of the claim state machine must match the database's, and the schemas
// must accept what the design says and refuse what it forbids.

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
}

const SPEC = {
  official_form: { url: 'https://official.example.test/claim' },
  class_definition: { text: 'All persons who bought the product.', source_url: 'https://official.example.test/notice' },
  attestation: { text: 'I declare under penalty of perjury that the above is true.' },
  member_fields: [
    { field: 'legal_name', official_label: 'Full Name', required: true },
    { field: 'address.zip', official_label: 'ZIP Code', required: true },
  ],
  questions: [
    { key: 'purchase_count', official_label: 'How many did you buy?', type: 'integer', required: true },
    {
      key: 'store',
      official_label: 'Where did you buy it?',
      type: 'single_choice',
      required: false,
      options: [{ value: 'online', official_label: 'Online' }],
    },
  ],
  payout_options: [{ value: 'check', official_label: 'Paper check' }],
  form_field_order: ['member.legal_name', 'member.address.zip', 'answers.purchase_count', 'payout_method'],
};

describe('claim state machine', () => {
  it('matches public.filing_claim_transition_allowed in 0038 edge for edge', () => {
    const sql = migration('0038_one_click_filing_guards.sql');
    const body = sql.slice(sql.indexOf('filing_claim_transition_allowed(p_from text'), sql.indexOf('$$;', sql.indexOf('filing_claim_transition_allowed(p_from text')));
    const fromSql = [...body.matchAll(/'([a-z_]*)>([a-z_]+)'/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const fromTs = Object.entries(CLAIM_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(fromSql.length).toBeGreaterThan(30);
    expect(fromTs).toEqual(fromSql);
  });

  it('adds exactly the agent-lane statuses that 0037 adds to claim_status', () => {
    const added = [...migration('0037_one_click_filing.sql').matchAll(/add value if not exists '([a-z_]+)'/g)].map((m) => m[1]);
    expect(added).toEqual([...AGENT_CLAIM_STATUSES]);
    expect(added).not.toContain('rejected');
  });

  it('never lets a claim that Lawsuit AI filed be withdrawn or reopened', () => {
    expect(canMoveClaim('filing', 'withdrawn')).toBe(false);
    expect(canMoveClaim('filed_by_claimmatch', 'preparing')).toBe(false);
    expect(canMoveClaim(null, 'preparing')).toBe(true);
    expect(canMoveClaim(null, 'queued')).toBe(false);
  });
});

describe('spec and policy content', () => {
  it('accepts a complete spec and fills its defaults', () => {
    const spec = FilingSpecContentSchema.parse(SPEC);
    expect(spec.official_form.challenges).toEqual([]);
    expect(spec.requires_agent_certification).toBe(false);
    expect(spec.questions[0].health_flag).toBe(false);
  });

  it('refuses fields Lawsuit AI never collects, broken choices and unknown order paths', () => {
    const withQuestion = (question: Record<string, unknown>) => ({ ...SPEC, questions: [question], form_field_order: [] });
    const issues = (value: unknown) => {
      const parsed = FilingSpecContentSchema.safeParse(value);
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
    };
    expect(issues(withQuestion({ key: 'pin', official_label: 'Enter your PIN', type: 'text', required: true }))).toEqual([
      'questions.0.official_label',
    ]);
    expect(issues(withQuestion({ key: 'ssn', official_label: 'Social Security Number', type: 'text', required: true }))).toEqual([
      'questions.0.official_label',
    ]);
    expect(issues(withQuestion({ key: 'store', official_label: 'Store', type: 'single_choice', required: true }))).toEqual([
      'questions.0.options',
    ]);
    expect(issues({ ...SPEC, form_field_order: ['answers.missing'] })).toEqual(['form_field_order.0']);
    expect(issues(withQuestion({ key: 'loyalty', official_label: 'Rewards card number', type: 'text', required: false }))).toEqual([]);
  });

  it('defaults a policy to unknown with no channels, and refuses a channel listed twice', () => {
    const policy = FilingPolicyContentSchema.parse({});
    expect(policy.agent_filing).toBe('unknown');
    expect(policy.channels).toEqual([]);
    expect(policy.identity_check_required).toBe(false);
    const desk = { type: 'filing_desk', enabled: true };
    expect(FilingPolicyContentSchema.parse({ channels: [desk] }).channels[0]).toMatchObject({ daily_capacity: 10, min_days_before_deadline: 5 });
    expect(FilingPolicyContentSchema.safeParse({ channels: [desk, desk] }).success).toBe(false);
  });

  it('allows agent filing only for the states the law firm lists (the state rule)', () => {
    const desk = { type: 'filing_desk', enabled: true };
    expect(FilingPolicyContentSchema.safeParse({ agent_filing: 'allowed', channels: [desk] }).success).toBe(false);
    expect(FilingPolicyContentSchema.safeParse({ agent_filing: 'allowed', channels: [desk], allowed_states: ['CA', 'NY'] }).success).toBe(true);
    expect(FilingPolicyContentSchema.safeParse({ agent_filing: 'prohibited' }).success).toBe(true);
  });

  it('never asks for payout details, but lists payout method names', () => {
    const ask = (official_label: string) =>
      FilingSpecContentSchema.safeParse({ ...SPEC, questions: [{ key: 'q', official_label, type: 'text', required: false }], form_field_order: [] }).success;
    expect(ask('PayPal email address')).toBe(false);
    expect(ask('Venmo phone number or username')).toBe(false);
    expect(ask('Payment account details')).toBe(false);
    expect(ask('Did you pay with PayPal?')).toBe(true);
    const proof = { key: 'basic', official_label: 'Basic', proof: [{ kind: 'check', official_label: 'Upload a voided check', required: true }] };
    expect(FilingSpecContentSchema.safeParse({ ...SPEC, benefit_tiers: [proof] }).success).toBe(false);
    const payout = { ...SPEC, payout_options: [{ value: 'paypal', official_label: 'PayPal' }, { value: 'venmo', official_label: 'Venmo' }] };
    expect(FilingSpecContentSchema.safeParse(payout).success).toBe(true);
  });

  it('parses Jev conditions and rules, and refuses fields Jev cannot read', () => {
    const check = { all: [{ field: 'answers.purchase_count', op: 'lte', value: 5 }, { not: { field: 'payout_method', op: 'absent' } }] };
    expect(JevConditionSchema.safeParse(check).success).toBe(true);
    expect(JevConditionSchema.safeParse({ field: 'profile.ssn', op: 'present' }).success).toBe(false);
    const rule = JevRuleSchema.parse({ id: 'kroger.max_items', description: 'At most 5 items without proof', severity: 'block', check, message: 'Without proof you can claim up to 5 items.' });
    expect(rule.audience).toBe('member');
  });
});

describe('member requests and the signed packet', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  const hash = 'a'.repeat(64);

  it('requires the member to tick the statement and accept the authorization', () => {
    const sign = { packet_hash: hash, revision: 3, spec_id: uuid, spec_version: 1, typed_name: 'Ada Lovelace', attestation_accepted: true, authorization_accepted: true, authorization_text_version: 'agent-auth-v1' };
    expect(SignRequestSchema.safeParse(sign).success).toBe(true);
    expect(SignRequestSchema.safeParse({ ...sign, attestation_accepted: false }).success).toBe(false);
    expect(SignRequestSchema.safeParse({ ...sign, extra: 1 }).success).toBe(false);
  });

  it('accepts partial packet updates and refuses unknown keys', () => {
    expect(UpdatePacketRequestSchema.safeParse({ revision: 1, member: { address: { zip: '94110' } } }).success).toBe(true);
    expect(UpdatePacketRequestSchema.safeParse({ revision: 1, member: { address: { zip: 'not a zip' } } }).success).toBe(false);
    expect(UpdatePacketRequestSchema.safeParse({ revision: 1, payout_account: '123' }).success).toBe(false);
  });

  it('signs only a complete packet whose class definition the member confirmed', () => {
    const packet = {
      format: 'claimmatch.packet.v1',
      claim_id: uuid,
      lawsuit_id: uuid,
      spec: { id: uuid, version: 1 },
      member: {
        legal_name: 'Ada Lovelace',
        first_name: null,
        last_name: null,
        email: 'ada@example.test',
        phone: null,
        address: { line1: '1 Main St', line2: null, city: 'Springfield', state: 'CA', zip: '94110' },
      },
      answers: { purchase_count: 2 },
      benefit_tier: null,
      payout_method: 'check',
      documents: [],
      confirmations: { class_definition: true, health_data_consent: null },
      class_definition_sha256: hash,
      attestation_sha256: hash,
    };
    expect(CanonicalPacketSchema.safeParse(packet).success).toBe(true);
    expect(CanonicalPacketSchema.safeParse({ ...packet, confirmations: { class_definition: false, health_data_consent: null } }).success).toBe(false);
    expect(CanonicalPacketSchema.safeParse({ ...packet, answers: { purchase_count: null } }).success).toBe(false);
  });
});

describe('errors and staff results', () => {
  it('has a status and a message for every code, and never answers 401 for a stale sign-in', () => {
    for (const code of FILING_ERROR_CODES) {
      expect(FILING_ERROR_HTTP[code]).toBeGreaterThanOrEqual(400);
      expect(FILING_ERROR_MESSAGES[code].length).toBeGreaterThan(5);
    }
    expect(FILING_ERROR_HTTP.reauth_required).toBe(403);
  });

  it('takes a confirmation number only with a filed result, and a reason for a rejection', () => {
    expect(RecordResultRequestSchema.safeParse({ outcome: 'filed', confirmation_number: 'ABC-1' }).success).toBe(true);
    expect(RecordResultRequestSchema.safeParse({ outcome: 'not_submitted', confirmation_number: 'ABC-1' }).success).toBe(false);
    expect(RecordResultRequestSchema.safeParse({ outcome: 'rejected' }).success).toBe(false);
  });
});

describe('signing checks the database repeats', () => {
  it('uses the same fresh sign-in rule as filing_sign_packet in 0039', () => {
    const sql = migration('0039_one_click_filing_functions.sql');
    const list = /p_auth_method not in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...FRESH_SIGN_IN_METHODS]);
    expect(sql).toContain(`interval '${REAUTH_MAX_AGE_SECONDS} seconds'`);
    expect(FRESH_SIGN_IN_METHODS).not.toContain('magiclink');
    expect(FILING_DB_ERRORS.CM015).toBe('reauth_required');
  });

  it('compares typed names the same way everywhere', () => {
    expect(normalizeTypedName('  Ada   LOVELACE ')).toBe('ada lovelace');
    expect(normalizeTypedName('José Nuñez')).toBe(normalizeTypedName('José Nuñez'));
  });
});

describe('staff roles and request records', () => {
  const staff = (isAdmin: boolean, roles: StaffUser['roles']): StaffUser => ({ id: 'u', email: null, isAdmin, roles });

  it('lets only a legal_reviewer add a legal_reviewer', () => {
    expect(canGrantStaffRole(staff(true, []), 'legal_reviewer')).toBe(false);
    expect(canGrantStaffRole(staff(true, []), 'filing_agent')).toBe(true);
    expect(canGrantStaffRole(staff(false, ['legal_reviewer']), 'legal_reviewer')).toBe(true);
    expect(canGrantStaffRole(staff(false, ['filing_agent']), 'filing_agent')).toBe(false);
    expect(canManageStaffRoles(staff(false, ['filing_agent']))).toBe(false);
  });

  it('keeps only addresses Postgres inet accepts', () => {
    const ip = (value: string) => requestIpForRecord(new Request('https://x.test', { headers: { 'x-forwarded-for': value } }));
    expect(ip('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7');
    expect(ip('2001:db8::1')).toBe('2001:db8::1');
    expect(ip('1:2:3:4:5:6:7:8')).toBe('1:2:3:4:5:6:7:8');
    expect(ip('1:2:3')).toBeNull();
    expect(ip('1::2::3')).toBeNull();
    expect(ip('999.1.1.1')).toBeNull();
    expect(ip('not-an-ip')).toBeNull();
  });
});
