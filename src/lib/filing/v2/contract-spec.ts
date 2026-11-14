/**
 * One-click filing: what the law firm and staff set per settlement.
 * CONTRACT (read-only for builders). The filing SPEC (the official form:
 * questions in its own wording, proof per benefit tier, the verbatim sworn
 * statement and class definition, payout options, field order, Jev rules) and
 * the filing POLICY (whether and how Lawsuit AI may file as the member's
 * agent). Both are versioned rows (filing_specs.content, filing_policies,
 * 0037): staff draft, only a legal_reviewer approves (0038 enforces it).
 *
 * Imports zod and ../../jev/types only, so the native app can share it later.
 */
import { z } from 'zod';
import { JevConditionSchema, JevRuleSchema } from '../../jev/types';

export const UuidSchema = z.string().uuid();
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Expected a lowercase SHA-256 hex digest');
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const HttpsUrlSchema = z.string().url().max(2000).regex(/^https:\/\//, 'Use an https:// link');
export const UsStateSchema = z.string().regex(/^[A-Z]{2}$/, 'Use the two-letter USPS code');
/** Question keys, proof kinds, tier keys and option values. */
export const KeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'Use lowercase letters, digits and underscores');

export const SPEC_STATUSES = ['draft', 'approved', 'superseded', 'retired'] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];
export const POLICY_STATUSES = ['draft', 'approved', 'superseded', 'rejected'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];
/** Default for every settlement: unknown, which routes to self_file. */
export const AGENT_FILING_VALUES = ['unknown', 'allowed', 'prohibited'] as const;
export type AgentFiling = (typeof AGENT_FILING_VALUES)[number];

/** Submission channels "on our side", in the default preference order. */
export const AGENT_CHANNELS = ['filing_desk', 'administrator_email', 'administrator_bulk', 'administrator_api'] as const;
export type AgentChannel = (typeof AGENT_CHANNELS)[number];

export const DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
] as const;
export type DocumentMime = (typeof DOCUMENT_MIME_TYPES)[number];

/**
 * Member (identity and contact) fields of the packet. legal_name, email,
 * phone and the address are prefilled from the profile (profiles.full_name,
 * email, phone, address_line1, address_line2, city, state, zip) and saved
 * back only with the member's consent. first_name and last_name exist for
 * forms that split the name; they are asked per claim and never saved.
 */
export const MEMBER_FIELDS = [
  'legal_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'address.line1',
  'address.line2',
  'address.city',
  'address.state',
  'address.zip',
] as const;
export type MemberField = (typeof MEMBER_FIELDS)[number];

/** Paths into the canonical packet (src/lib/filing/v2/contract.ts), used by field order, bulk columns and the desk. */
export const PACKET_PATH_RE =
  /^(?:member\.(?:legal_name|first_name|last_name|email|phone|address\.(?:line1|line2|city|state|zip))|answers\.[a-z][a-z0-9_]{0,63}|benefit_tier|payout_method|documents\.[a-z][a-z0-9_]{0,63})$/;
export const PacketPathSchema = z.string().regex(PACKET_PATH_RE, 'Not a packet field');

export const QUESTION_TYPES = [
  'text',
  'long_text',
  'email',
  'phone',
  'date',
  'integer',
  'decimal',
  'money',
  'yes_no',
  'single_choice',
  'multi_choice',
  'us_state',
  'zip',
  'vin',
  'notice_id',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Labels that ask for something Lawsuit AI never stores: PINs, passcodes,
 * one-time or verification codes, passwords, SSNs or tax ids, bank or payment
 * card details. Such a field stays on the official site, so a spec may not
 * contain it.
 */
export const NEVER_COLLECTED_LABEL_RE =
  /\b(?:pins?|passcodes?|passwords?|one[\s-]time\s+(?:pass)?codes?|verification\s+codes?|security\s+codes?|cvv|cvc|ssn|social\s+security|tax\s*id|tin|routing\s+numbers?|bank\s+account|iban|(?:credit|debit)\s+card\s+numbers?)\b/i;

/**
 * Question and proof labels that ask where the money goes (a PayPal, Venmo,
 * Zelle or Cash App address, payment account details, a voided check). Payout
 * always goes to the member, who picks the payout method's name only
 * (payout_options); the details stay with the administrator.
 */
export const PAYOUT_DETAIL_LABEL_RE =
  /\b(?:paypal|venmo|zelle|cash\s*app)\b[^.?!]*\b(?:e-?mail|phone|number|account|handle|user\s*name|id)\b|\b(?:payment|payout|deposit)\s+(?:account|details|destination)\b|\bvoided\s+checks?\b/i;

const LabelSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((label) => !NEVER_COLLECTED_LABEL_RE.test(label), {
      message: 'Lawsuit AI never collects PINs, codes, passwords, SSNs or account numbers: leave this on the official site',
    });
/** Labels of questions and proof, which may never ask for payout details. */
const AskLabelSchema = (max: number) =>
  LabelSchema(max).refine((label) => !PAYOUT_DETAIL_LABEL_RE.test(label), {
    message: 'Lawsuit AI never collects payout account details: the member picks a payout method name only',
  });

const OptionSchema = z.object({ value: KeySchema, official_label: LabelSchema(300) }).strict();

export const SpecQuestionSchema = z
  .object({
    key: KeySchema,
    /** The official form's wording, verbatim. */
    official_label: AskLabelSchema(1000),
    /** Lawsuit AI's plain-English help; never replaces the official label. */
    help: z.string().max(1000).nullable().default(null),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean(),
    /** Required for single_choice and multi_choice. */
    options: z.array(OptionSchema).min(1).max(100).nullable().default(null),
    validation: z
      .object({
        min: z.number().finite().optional(),
        max: z.number().finite().optional(),
        min_length: z.number().int().min(0).max(2000).optional(),
        max_length: z.number().int().min(1).max(2000).optional(),
        /** Checked for safety like a Jev `matches` pattern. */
        pattern: z.string().min(1).max(200).optional(),
        pattern_hint: z.string().max(200).optional(),
      })
      .strict()
      .nullable()
      .default(null),
    /** Asked only when this holds (fields as in Jev). */
    visible_when: JevConditionSchema.nullable().default(null),
    /** Benefit tiers that ask it; null means every tier. */
    tiers: z.array(KeySchema).min(1).max(10).nullable().default(null),
    /** Health data (Washington My Health My Data Act): never collected without the policy's consent text and the member's consent. */
    health_flag: z.boolean().default(false),
  })
  .strict();
export type SpecQuestion = z.infer<typeof SpecQuestionSchema>;

export const ProofRequirementSchema = z
  .object({
    kind: KeySchema,
    official_label: AskLabelSchema(500),
    help: z.string().max(1000).nullable().default(null),
    required: z.boolean(),
    min_files: z.number().int().min(0).max(10).default(1),
    max_files: z.number().int().min(1).max(10).default(3),
    accepted_mime: z.array(z.enum(DOCUMENT_MIME_TYPES)).min(1).default([...DOCUMENT_MIME_TYPES]),
    health_flag: z.boolean().default(false),
  })
  .strict();
export type ProofRequirement = z.infer<typeof ProofRequirementSchema>;

export const BenefitTierSchema = z
  .object({
    key: KeySchema,
    official_label: LabelSchema(500),
    description: z.string().max(2000).nullable().default(null),
    proof: z.array(ProofRequirementSchema).max(10).default([]),
  })
  .strict();
export type BenefitTier = z.infer<typeof BenefitTierSchema>;

/** Payout method names only (check, PayPal, ...). Account details are never collected. */
export const PayoutOptionSchema = OptionSchema;
export type PayoutOption = z.infer<typeof PayoutOptionSchema>;

export const MemberFieldSpecSchema = z
  .object({ field: z.enum(MEMBER_FIELDS), official_label: LabelSchema(300), required: z.boolean() })
  .strict();

export const OFFICIAL_FORM_CHALLENGES = ['captcha', 'email_code', 'sms_code', 'identity_check', 'account_login'] as const;
export type OfficialFormChallenge = (typeof OFFICIAL_FORM_CHALLENGES)[number];

export const FilingSpecContentSchema = z
  .object({
    official_form: z
      .object({
        url: HttpsUrlSchema,
        title: z.string().max(300).nullable().default(null),
        /**
         * Checks the official site is known to show. The desk never handles
         * one: a known challenge keeps filing_desk off for this settlement, and
         * one met while filing is a hard stop (outcome stopped_at_challenge).
         */
        challenges: z.array(z.enum(OFFICIAL_FORM_CHALLENGES)).max(5).default([]),
      })
      .strict(),
    class_definition: z.object({ text: z.string().min(1).max(10000), source_url: HttpsUrlSchema }).strict(),
    /** The sworn statement, verbatim. Shown word for word; never pre-ticked or typed for the member. */
    attestation: z
      .object({ text: z.string().min(1).max(10000), source_url: HttpsUrlSchema.nullable().default(null) })
      .strict(),
    /** The official form makes the submitter swear to facts (e.g. Kroger, Raging Waters). */
    requires_agent_certification: z.boolean().default(false),
    deadline: z
      .object({
        date: IsoDateSchema,
        time_zone: z.string().min(1).max(64).default('America/New_York'),
        type: z.enum(['submit_online_by', 'postmark_by', 'received_by']),
      })
      .strict()
      .nullable()
      .default(null),
    member_fields: z.array(MemberFieldSpecSchema).min(1).max(MEMBER_FIELDS.length),
    questions: z.array(SpecQuestionSchema).max(60).default([]),
    benefit_tiers: z.array(BenefitTierSchema).max(10).default([]),
    payout_options: z.array(PayoutOptionSchema).max(10).default([]),
    /** Every packet path in the official form's order (the desk and the email follow it). */
    form_field_order: z.array(PacketPathSchema).max(150).default([]),
    jev_rules: z.array(JevRuleSchema).max(100).default([]),
    desk_notes: z.string().max(4000).nullable().default(null),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const dupes = (values: string[], path: (string | number)[], what: string) => {
      const seen = new Set<string>();
      values.forEach((value, i) => {
        if (seen.has(value)) ctx.addIssue({ code: 'custom', path: [...path, i], message: `Duplicate ${what} ${value}` });
        seen.add(value);
      });
    };
    dupes(spec.questions.map((q) => q.key), ['questions'], 'question key');
    dupes(spec.member_fields.map((m) => m.field), ['member_fields'], 'member field');
    dupes(spec.benefit_tiers.map((t) => t.key), ['benefit_tiers'], 'benefit tier');
    dupes(spec.payout_options.map((o) => o.value), ['payout_options'], 'payout option');
    dupes(spec.form_field_order, ['form_field_order'], 'field');
    if (!spec.member_fields.some((m) => m.field === 'legal_name' && m.required)) {
      ctx.addIssue({ code: 'custom', path: ['member_fields'], message: 'legal_name must be a required member field' });
    }
    const tiers = new Set(spec.benefit_tiers.map((t) => t.key));
    const kinds = new Set(spec.benefit_tiers.flatMap((t) => t.proof.map((p) => p.kind)));
    spec.questions.forEach((q, i) => {
      const choice = q.type === 'single_choice' || q.type === 'multi_choice';
      if (choice !== Boolean(q.options)) {
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'options'], message: 'Choice questions, and only they, need options' });
      }
      q.tiers?.forEach((t, j) => {
        if (!tiers.has(t)) ctx.addIssue({ code: 'custom', path: ['questions', i, 'tiers', j], message: `No benefit tier ${t}` });
      });
    });
    const paths = new Set<string>([
      ...spec.member_fields.map((m) => `member.${m.field}`),
      ...spec.questions.map((q) => `answers.${q.key}`),
      ...[...kinds].map((k) => `documents.${k}`),
      ...(spec.benefit_tiers.length ? ['benefit_tier'] : []),
      ...(spec.payout_options.length ? ['payout_method'] : []),
    ]);
    spec.form_field_order.forEach((p, i) => {
      if (!paths.has(p)) ctx.addIssue({ code: 'custom', path: ['form_field_order', i], message: `${p} is not in this spec` });
    });
  });
/** filing_specs.content as stored and served. */
export type FilingSpecContent = z.infer<typeof FilingSpecContentSchema>;
/** What staff send when drafting (defaults not yet applied). */
export type FilingSpecContentInput = z.input<typeof FilingSpecContentSchema>;

/** A document the law firm reviewed (policy sources and every approval). */
export const SourceReviewedSchema = z
  .object({
    kind: z.enum([
      'settlement_agreement',
      'court_order',
      'long_form_notice',
      'claim_form',
      'administrator_letter',
      'administrator_terms',
      'website_terms',
      'other',
    ]),
    title: z.string().min(1).max(300),
    url: HttpsUrlSchema.nullable().default(null),
    /** Internal file reference when there is no public link. */
    document_ref: z.string().max(300).nullable().default(null),
    reviewed_on: IsoDateSchema,
    notes: z.string().max(2000).nullable().default(null),
  })
  .strict();
export type SourceReviewed = z.infer<typeof SourceReviewedSchema>;

const DaysBeforeDeadline = (d: number) => z.number().int().min(1).max(60).default(d);

export const FilingDeskConfigSchema = z
  .object({
    type: z.literal('filing_desk'),
    enabled: z.boolean(),
    daily_capacity: z.number().int().min(1).max(200).default(10),
    sla_business_days: z.number().int().min(1).max(10).default(2),
    min_days_before_deadline: DaysBeforeDeadline(5),
    accepts_documents: z.boolean().default(true),
    instructions: z.string().max(4000).nullable().default(null),
  })
  .strict();

export const AdministratorEmailConfigSchema = z
  .object({
    type: z.literal('administrator_email'),
    enabled: z.boolean(),
    /** The administrator's published claims address. */
    to: z.string().email().max(320),
    cc: z.array(z.string().email().max(320)).max(3).default([]),
    /** Where the administrator publishes that address (a reviewed source). */
    published_at_url: HttpsUrlSchema,
    subject_prefix: z.string().max(120).nullable().default(null),
    attach_documents: z.boolean().default(true),
    max_total_attachment_bytes: z.number().int().min(1).max(30 * 1024 * 1024).default(20 * 1024 * 1024),
    min_days_before_deadline: DaysBeforeDeadline(5),
  })
  .strict();

export const BulkSourceSchema = z.union([
  z.object({ path: PacketPathSchema.refine((p) => !p.startsWith('documents.'), 'A CSV cannot carry documents') }).strict(),
  z.object({ signature: z.enum(['typed_name', 'signed_at', 'packet_hash', 'signature_id']) }).strict(),
  z.object({ claim: z.enum(['claim_id', 'reference']) }).strict(),
  z.object({ constant: z.string().max(200) }).strict(),
]);
export type BulkSource = z.infer<typeof BulkSourceSchema>;

export const AdministratorBulkConfigSchema = z
  .object({
    type: z.literal('administrator_bulk'),
    enabled: z.boolean(),
    /** The administrator's third-party-filer column layout, in order. */
    columns: z.array(z.object({ header: z.string().min(1).max(120), source: BulkSourceSchema }).strict()).min(1).max(80),
    file_name_prefix: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).default('claimmatch'),
    max_rows: z.number().int().min(1).max(5000).default(500),
    min_days_before_deadline: DaysBeforeDeadline(7),
  })
  .strict();

export const AdministratorApiConfigSchema = z
  .object({
    type: z.literal('administrator_api'),
    enabled: z.boolean(),
    /** Slug of a registered adapter (src/lib/administrators/adapters.ts). None exists yet. */
    adapter: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
    min_days_before_deadline: DaysBeforeDeadline(3),
  })
  .strict();

export const ChannelConfigSchema = z.discriminatedUnion('type', [
  FilingDeskConfigSchema,
  AdministratorEmailConfigSchema,
  AdministratorBulkConfigSchema,
  AdministratorApiConfigSchema,
]);
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;
export type ChannelConfigFor<C extends AgentChannel> = Extract<ChannelConfig, { type: C }>;

/** filing_policies columns other than ids, version, status and approval fields. */
export const FilingPolicyContentSchema = z
  .object({
    agent_filing: z.enum(AGENT_FILING_VALUES).default('unknown'),
    /** In preference order: the first enabled channel that can take the claim wins. */
    channels: z.array(ChannelConfigSchema).max(AGENT_CHANNELS.length).default([]),
    agent_certification_allowed: z.boolean().default(false),
    /**
     * The states the law firm covers (claim-autopilot "state rule"). Null means
     * no restriction at this level, so a policy that allows agent filing must list them.
     */
    allowed_states: z.array(UsStateSchema).min(1).max(60).nullable().default(null),
    health_sensitive: z.boolean().default(false),
    /** The law firm's consent text; without it flagged health answers and documents are never collected. */
    health_consent_text: z.string().min(1).max(5000).nullable().default(null),
    /** No identity vendor exists yet, so true keeps every agent channel off. */
    identity_check_required: z.boolean().default(false),
    sources_reviewed: z.array(SourceReviewedSchema).max(50).default([]),
    notes: z.string().max(10000).nullable().default(null),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const types = policy.channels.map((c) => c.type);
    if (new Set(types).size !== types.length) {
      ctx.addIssue({ code: 'custom', path: ['channels'], message: 'Each channel may appear once' });
    }
    if (policy.agent_filing === 'allowed' && policy.allowed_states === null) {
      ctx.addIssue({ code: 'custom', path: ['allowed_states'], message: 'List the states the law firm covers for agent filing' });
    }
  });
export type FilingPolicyContent = z.infer<typeof FilingPolicyContentSchema>;
export type FilingPolicyContentInput = z.input<typeof FilingPolicyContentSchema>;

/** A filing_policies row as the server reads it (snake_case, as stored). */
export interface FilingPolicyRecord extends FilingPolicyContent {
  id: string;
  lawsuit_id: string | null;
  administrator_id: string | null;
  version: number;
  status: PolicyStatus;
  approved_by: string | null;
  approved_at: string | null;
}

/** filing_controls: effective at once, no approval. */
export interface FilingControlsRecord {
  lawsuit_id: string | null;
  administrator_id: string | null;
  kill_switch: boolean;
  kill_switch_reason: string | null;
  objection_received_at: string | null;
}

/**
 * The policy in force for one settlement (resolveEffectivePolicy in
 * src/lib/filing/channels/index.ts). Server-internal: never sent to members.
 * The administrator level can only restrict; channels and their config come
 * from the approved settlement-level version alone.
 */
export interface EffectiveFilingPolicy {
  settlement_policy_id: string | null;
  administrator_policy_id: string | null;
  /** 'allowed' only when the approved settlement version says so and no administrator version prohibits. */
  agent_filing: AgentFiling;
  /** Enabled channels of the approved settlement version, in its order. */
  channels: ChannelConfig[];
  agent_certification_allowed: boolean;
  allowed_states: string[] | null;
  health_sensitive: boolean;
  health_consent_text: string | null;
  identity_check_required: boolean;
  /** lawsuits.third_party_fee_status (0023). No fee is charged in this build. */
  third_party_fee_status: 'unknown' | 'allowed' | 'barred';
  kill_switch: boolean;
  kill_switch_scope: 'settlement' | 'administrator' | null;
  objection_received_at: string | null;
}

/** The safe default: no approved policy, nothing in force, self_file. */
export const DEFAULT_EFFECTIVE_POLICY: EffectiveFilingPolicy = {
  settlement_policy_id: null,
  administrator_policy_id: null,
  agent_filing: 'unknown',
  channels: [],
  agent_certification_allowed: false,
  allowed_states: null,
  health_sensitive: false,
  health_consent_text: null,
  identity_check_required: false,
  third_party_fee_status: 'unknown',
  kill_switch: false,
  kill_switch_scope: null,
  objection_received_at: null,
};
