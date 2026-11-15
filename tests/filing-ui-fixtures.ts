/**
 * Fixtures for the one-click filing UI tests (tests/filing-ui-*.test.ts(x)).
 * Every view is parsed with the contract's own schema, so a fixture can never
 * drift from what the member API sends.
 */
import {
  ClaimFilingViewSchema,
  type ClaimFilingView,
  type JevIssueView,
  type LaneView,
  type PacketItemView,
} from '@/lib/filing/v2/contract';

export const CLAIM_ID = '00000000-0000-4000-8000-0000000000c1';
export const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000d1';
export const SPEC_ID = '00000000-0000-4000-8000-0000000000e1';
export const PACKET_ID = '00000000-0000-4000-8000-0000000000f1';
export const SIGNATURE_ID = '00000000-0000-4000-8000-0000000000a9';
export const DOC_ID = '00000000-0000-4000-8000-0000000000b1';
export const HASH = 'a'.repeat(64);
export const OFFICIAL_FORM = 'https://www.widget-settlement.example/claim';
export const CLASS_SOURCE = 'https://www.widget-settlement.example/notice';
export const CLASS_TEXT =
  'All persons in the United States who bought a Widget  between January 1, 2020 and June 30, 2024.\nExcluded: the judge and staff.';
export const STATEMENT =
  'I declare under penalty of perjury under the laws of the United States that the information in this claim form is true and correct.';
export const AUTH_TEXT = 'I authorize Lawsuit AI to submit this one claim to the settlement administrator for me. (agent-auth-v1 test text)';
export const ESIGN_TEXT = 'You agree to receive records and sign electronically. You may ask for a paper copy. (esign test text)';

export function issue(overrides: Partial<JevIssueView> = {}): JevIssueView {
  return {
    rule_id: 'global.required_answers',
    source: 'global',
    severity: 'info',
    code: 'required_missing',
    message: 'Answer this question.',
    field: null,
    ...overrides,
  };
}

export function item(overrides: Partial<PacketItemView> & Pick<PacketItemView, 'path'>): PacketItemView {
  return {
    kind: 'question',
    label: 'Label',
    help: null,
    type: 'text',
    required: true,
    options: null,
    value: null,
    missing: false,
    health_flag: false,
    locked: null,
    issues: [],
    proof: null,
    ...overrides,
  };
}

/** A typical packet: profile details in place, a ZIP missing, two questions, a tier, a payout method and a proof slot. */
export function defaultItems(): PacketItemView[] {
  return [
    item({ path: 'member.legal_name', kind: 'member', label: 'Full legal name', value: 'Ada Lovelace' }),
    item({ path: 'member.email', kind: 'member', label: 'Email address', type: 'email', value: 'ada@example.com' }),
    item({ path: 'member.address.line1', kind: 'member', label: 'Street address', value: '1 Main St' }),
    item({ path: 'member.address.city', kind: 'member', label: 'City', value: 'Springfield' }),
    item({ path: 'member.address.state', kind: 'member', label: 'State', type: 'us_state', value: 'CA' }),
    item({
      path: 'member.address.zip',
      kind: 'member',
      label: 'ZIP Code',
      type: 'zip',
      missing: true,
      issues: [issue({ rule_id: 'global.member_address', message: 'Add your ZIP code.', field: 'member.address.zip' })],
    }),
    item({
      path: 'answers.widget_count',
      label: 'How many Widgets did you purchase during the Class Period?',
      type: 'integer',
      missing: true,
      help: 'Count each Widget you bought.',
    }),
    item({
      path: 'answers.bought_online',
      label: 'Did you purchase the Widget online?',
      type: 'yes_no',
      required: false,
    }),
    item({
      path: 'benefit_tier',
      kind: 'choice',
      label: 'Benefit you are claiming',
      type: 'single_choice',
      options: [
        { value: 'no_proof', label: 'Tier A: without proof of purchase' },
        { value: 'with_proof', label: 'Tier B: with proof of purchase' },
      ],
      value: 'with_proof',
    }),
    item({
      path: 'payout_method',
      kind: 'choice',
      label: 'Payment method',
      type: 'single_choice',
      options: [
        { value: 'check', label: 'Paper check' },
        { value: 'paypal', label: 'PayPal' },
      ],
      missing: true,
    }),
    item({
      path: 'documents.receipt',
      kind: 'document',
      label: 'Proof of purchase (a photo of your Widget box or a store printout)',
      type: 'document',
      missing: true,
      proof: { min_files: 1, max_files: 2, accepted_mime: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], documents: [] },
    }),
  ];
}

export const DESK_LANE: LaneView = {
  lane: 'filing_desk',
  agent: true,
  reasons: [],
  last_day_for_agent: '2026-12-10',
  deadline: '2026-12-15',
};

export const SELF_FILE_LANE: LaneView = {
  lane: 'self_file',
  agent: false,
  reasons: ['not_offered_for_settlement'],
  last_day_for_agent: null,
  deadline: '2026-12-15',
};

type ViewOverrides = {
  status?: string;
  lane?: LaneView;
  items?: PacketItemView[];
  packet?: Partial<NonNullable<ClaimFilingView['packet']>> | null;
  actions?: Partial<ClaimFilingView['actions']>;
  esignConsented?: boolean;
  timeline?: ClaimFilingView['timeline'];
  signature?: ClaimFilingView['signature'];
  confirmation?: string | null;
  authorization?: ClaimFilingView['authorization'];
};

export function filingView(o: ViewOverrides = {}): ClaimFilingView {
  const status = o.status ?? 'preparing';
  const lane = o.lane ?? DESK_LANE;
  const packet =
    o.packet === null
      ? null
      : {
          id: PACKET_ID,
          status: 'open' as const,
          revision: 3,
          packet_hash: null,
          complete: false,
          spec: {
            id: SPEC_ID,
            version: 2,
            official_form_url: OFFICIAL_FORM,
            form_title: 'Widget Settlement Claim Form',
            class_definition: { text: CLASS_TEXT, source_url: CLASS_SOURCE },
            attestation_text: STATEMENT,
            benefit_tiers: [
              { key: 'no_proof', label: 'Tier A: without proof of purchase', description: null },
              { key: 'with_proof', label: 'Tier B: with proof of purchase', description: null },
            ],
            payout_options: [
              { value: 'check', label: 'Paper check' },
              { value: 'paypal', label: 'PayPal' },
            ],
          },
          items: o.items ?? defaultItems(),
          choices: { benefit_tier: 'with_proof', payout_method: null, class_definition_confirmed: false, health_consent: null },
          health_consent_text: null,
          jev: { mode: 'partial' as const, outcome: 'pass' as const, evaluated_at: '2026-11-12T15:00:00Z', issues: [] },
          save_member_to_profile_available: true,
          ...o.packet,
        };
  const view: ClaimFilingView = {
    api_version: 1,
    server_time: '2026-11-12T15:00:00Z',
    claim: {
      id: CLAIM_ID,
      lawsuit_id: LAWSUIT_ID,
      status,
      confirmation_number: o.confirmation ?? null,
      updated_at: '2026-11-12T15:00:00Z',
    },
    settlement: {
      id: LAWSUIT_ID,
      slug: 'widget-settlement',
      title: 'Widget settlement',
      deadline: '2026-12-15',
      deadline_passed: false,
      official_url: OFFICIAL_FORM,
    },
    lane,
    packet,
    timeline: o.timeline ?? [
      { at: '2026-11-12T14:00:00Z', status: 'preparing', from: null, actor: 'you', action: 'start', confirmation_number: null },
    ],
    actions: {
      can_edit: true,
      can_upload: true,
      can_sign: false,
      can_reopen: false,
      can_withdraw: true,
      can_self_file: true,
      can_add_confirmation: false,
      needs_esign_consent: false,
      needs_fresh_sign_in: false,
      ...o.actions,
    },
    esign: { text_version: 'esign-v1', text: ESIGN_TEXT, consented: o.esignConsented ?? true },
    authorization: o.authorization === undefined ? (lane.agent ? { text_version: 'agent-auth-v1', text: AUTH_TEXT } : null) : o.authorization,
    signature: o.signature ?? null,
  };
  return ClaimFilingViewSchema.parse(view);
}

/** A packet that is complete and ready to sign on the desk lane. */
export function readyView(o: ViewOverrides = {}): ClaimFilingView {
  const items = defaultItems().map((i) => ({ ...i, missing: false, issues: [] as JevIssueView[] }));
  items[5] = { ...items[5], value: '94110' };
  items[6] = { ...items[6], value: 3 };
  items[9] = { ...items[9], value: 'check' };
  items[10] = {
    ...items[10],
    proof: {
      ...items[10].proof!,
      documents: [
        {
          id: DOC_ID,
          kind: 'receipt',
          status: 'stored',
          mime: 'image/jpeg',
          size_bytes: 2 * 1024 * 1024,
          sha256: HASH,
          created_at: '2026-11-12T14:10:00Z',
          stored_at: '2026-11-12T14:10:05Z',
        },
      ],
    },
  };
  return filingView({
    status: 'ready',
    items,
    ...o,
    packet: { packet_hash: HASH, complete: true, ...o.packet },
    actions: { can_sign: true, ...o.actions },
  });
}
