/**
 * Jev: Lawsuit AI's verification rules engine for one-click filing.
 * CONTRACT (read-only for builders; only the contract reviewer and the
 * integrator change it). Types and zod schemas only.
 *
 * runJev (src/lib/jev/index.ts) is a pure, synchronous, deterministic
 * function of its input: no I/O, no clock (the caller passes `now`), no
 * randomness. The caller passes every packet and text hash; Jev hashes only
 * its own rule set (rule_set_hash: synchronous SHA-256, e.g. node:crypto, over
 * its own deterministic serialization; it never calls B2's stubs). It checks a
 * packet while the member fills it (partial), before signing (pre_sign) and
 * again in the background right before sending (pre_send). Global rules are
 * code (JEV_GLOBAL_RULE_IDS); per-settlement rules are data in the approved
 * filing spec (FilingSpecContent.jev_rules), drafted by staff and approved by
 * a legal_reviewer. Every run of a real packet is stored in jev_runs (0037).
 *
 * Imports zod and type-only relative paths only, so the native app can share
 * this file later (mobile/shared.json rules).
 */
import { z } from 'zod';
import type { Lane, PacketDraft } from '../filing/v2/contract';
import type { EffectiveFilingPolicy, FilingSpecContent, SpecStatus } from '../filing/v2/contract-spec';

export const JEV_MODES = ['partial', 'pre_sign', 'pre_send'] as const;
export type JevMode = (typeof JEV_MODES)[number];

export const JEV_SEVERITIES = ['block', 'warn', 'info'] as const;
export type JevSeverity = (typeof JEV_SEVERITIES)[number];

/** block if any block issue, else warn if any warn issue, else pass. */
export const JEV_OUTCOMES = ['pass', 'warn', 'block'] as const;
export type JevOutcome = (typeof JEV_OUTCOMES)[number];

/** jev_runs.triggered_by. Console previews on sample data are not stored. */
export const JEV_TRIGGERS = ['member_save', 'member_sign', 'worker', 'staff'] as const;
export type JevTrigger = (typeof JEV_TRIGGERS)[number];

/** member: shown to the member (plain English). staff: console and desk only, never sent to members. */
export const JEV_AUDIENCES = ['member', 'staff'] as const;
export type JevAudience = (typeof JEV_AUDIENCES)[number];

/**
 * Fields a condition may read: the canonical packet's paths, plus
 * doc_count.<kind> (stored documents of that kind) and meta.days_to_deadline
 * (input.settlement.daysToDeadline) and meta.lane.
 */
export const JEV_FIELD_RE =
  /^(?:member\.(?:legal_name|first_name|last_name|email|phone|address\.(?:line1|line2|city|state|zip))|answers\.[a-z][a-z0-9_]{0,63}|benefit_tier|payout_method|doc_count\.[a-z][a-z0-9_]{0,63}|meta\.(?:days_to_deadline|lane))$/;
export const JevFieldSchema = z.string().regex(JEV_FIELD_RE, 'Not a field Jev can read');

const JevScalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
export type JevScalar = z.infer<typeof JevScalarSchema>;
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/**
 * A condition, as JSON. No code, no eval. Depth at most 6 and at most 50
 * nodes per rule (validateJevRules enforces it). `matches` patterns are
 * checked for safety by validateJevRules (length, no back-references, no
 * nested quantifiers) and run without the `g` or `y` flags.
 */
export type JevCondition =
  | { all: JevCondition[] }
  | { any: JevCondition[] }
  | { not: JevCondition }
  | { field: string; op: 'present' | 'absent' | 'is_true' | 'is_false' }
  | { field: string; op: 'eq' | 'neq'; value: JevScalar }
  | { field: string; op: 'in' | 'not_in'; values: JevScalar[] }
  | { field: string; op: 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { field: string; op: 'date_before' | 'date_on_or_after'; value: string }
  | { field: string; op: 'length_between'; min: number; max: number }
  | { field: string; op: 'matches'; pattern: string }
  | { field: string; op: 'eq_field'; other: string };

export const JevConditionSchema: z.ZodType<JevCondition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(JevConditionSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(JevConditionSchema).min(1).max(20) }).strict(),
    z.object({ not: JevConditionSchema }).strict(),
    z.object({ field: JevFieldSchema, op: z.enum(['present', 'absent', 'is_true', 'is_false']) }).strict(),
    z.object({ field: JevFieldSchema, op: z.enum(['eq', 'neq']), value: JevScalarSchema }).strict(),
    z.object({ field: JevFieldSchema, op: z.enum(['in', 'not_in']), values: z.array(JevScalarSchema).min(1).max(100) }).strict(),
    z.object({ field: JevFieldSchema, op: z.enum(['gt', 'gte', 'lt', 'lte']), value: z.number().finite() }).strict(),
    z.object({ field: JevFieldSchema, op: z.enum(['date_before', 'date_on_or_after']), value: IsoDate }).strict(),
    z
      .object({
        field: JevFieldSchema,
        op: z.literal('length_between'),
        min: z.number().int().min(0).max(5000),
        max: z.number().int().min(0).max(5000),
      })
      .strict(),
    z.object({ field: JevFieldSchema, op: z.literal('matches'), pattern: z.string().min(1).max(200) }).strict(),
    z.object({ field: JevFieldSchema, op: z.literal('eq_field'), other: JevFieldSchema }).strict(),
  ]),
);

/**
 * A per-settlement rule. The packet must satisfy `check` whenever `when`
 * holds (or always, without `when`); otherwise Jev reports `message` at
 * `severity`. In partial mode a rule whose fields are all still empty is
 * skipped, so members are not warned about questions they have not reached.
 */
export const JevRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_.-]{2,79}$/, 'Use lowercase letters, digits, dot, dash or underscore'),
    description: z.string().min(1).max(500),
    severity: z.enum(JEV_SEVERITIES),
    /** Modes the rule runs in; all three when omitted. */
    modes: z.array(z.enum(JEV_MODES)).min(1).max(3).optional(),
    when: JevConditionSchema.optional(),
    check: JevConditionSchema,
    /** Plain English, at most 300 characters. Member-facing unless audience is staff. */
    message: z.string().min(1).max(300),
    /** Where the UI shows the issue. */
    field: JevFieldSchema.optional(),
    audience: z.enum(JEV_AUDIENCES).default('member'),
  })
  .strict();
export type JevRule = z.infer<typeof JevRuleSchema>;
export const JevRuleSetSchema = z.array(JevRuleSchema).max(100);

export const JevIssueSchema = z.object({
  rule_id: z.string(),
  source: z.enum(['global', 'settlement']),
  severity: z.enum(JEV_SEVERITIES),
  /** Stable machine code, e.g. required_missing, secret_like_value, state_not_covered. */
  code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  message: z.string(),
  field: z.string().nullable(),
  audience: z.enum(JEV_AUDIENCES),
});
export type JevIssue = z.infer<typeof JevIssueSchema>;

export interface JevResult {
  engine_version: string;
  mode: JevMode;
  outcome: JevOutcome;
  /** Ordered: block first, then warn, then info; within a severity, by field order then rule id. */
  issues: JevIssue[];
  counts: { block: number; warn: number; info: number };
  /** SHA-256 hex of the canonical JSON of the rules evaluated (engine version, global rule ids, settlement rules). */
  rule_set_hash: string;
  /** input.packetHash, echoed. */
  packet_hash: string | null;
  /** input.now, echoed. */
  evaluated_at: string;
}

/** pre_send only: the live signature as stored. typed_name is compared with normalizeTypedName (contract-base.ts). */
export interface JevSignatureFacts {
  id: string;
  packet_hash: string;
  typed_name: string;
  statement_sha256: string;
  lane: Lane;
  voided: boolean;
  signed_at: string;
}

export interface JevInput {
  mode: JevMode;
  /** ISO 8601 instant. Jev never reads the clock. */
  now: string;
  /** The lane chooseLane picked (src/lib/filing/channels/index.ts). */
  lane: Lane;
  /** The packet as it stands, complete or not. */
  packet: PacketDraft;
  /** SHA-256 of the canonical packet when it is complete (computePacketHash), else null. */
  packetHash: string | null;
  /** The packet's spec version, or null when the settlement has no approved spec. */
  spec: {
    id: string;
    version: number;
    status: SpecStatus;
    content: FilingSpecContent;
    /** SHA-256 hex of content.attestation.text and of content.class_definition.text. */
    attestation_sha256: string;
    class_definition_sha256: string;
  } | null;
  policy: EffectiveFilingPolicy;
  /**
   * deadline: the effective one (the earlier of lawsuits.deadline and the spec's
   * deadline.date); daysToDeadline: whole calendar days to it, counted in the
   * spec's deadline.time_zone (America/New_York without one), 0 on the last day.
   */
  settlement: { openForClaims: boolean; deadline: string | null; daysToDeadline: number | null };
  /** required: policy.health_sensitive, or any health_flag item the member's tier asks. */
  healthConsent: { required: boolean; textAvailable: boolean; given: boolean };
  /** pre_send: the live signature; null otherwise. */
  signature: JevSignatureFacts | null;
  /** Staff-audience facts computed by the caller (same name and address on another account for this settlement). */
  duplicates: { sameIdentityOtherAccounts: number } | null;
}

/** The global rules (code, src/lib/jev/**). Their meaning: docs/designs/one-click-filing.md, section 7. */
export const JEV_GLOBAL_RULE_IDS = [
  'global.settlement_open',
  'global.lane_allowed',
  'global.spec_approved',
  'global.deadline_cutoff',
  'global.member_identity',
  'global.member_address',
  'global.allowed_states',
  'global.required_answers',
  'global.answer_types',
  'global.unknown_answers',
  'global.no_secrets',
  'global.health_consent',
  'global.class_definition_confirmed',
  'global.benefit_tier',
  'global.payout_method',
  'global.proof_documents',
  'global.packet_size',
  'global.signature_binding',
  'global.statement_unchanged',
  'global.duplicate_identity',
] as const;
export type JevGlobalRuleId = (typeof JEV_GLOBAL_RULE_IDS)[number];

/**
 * Issue codes that mean "never store this": the packet API refuses the save
 * (422) instead of keeping the value and flagging it.
 */
export const JEV_REFUSE_TO_STORE_CODES = [
  'secret_like_value',
  'health_consent_required',
  'not_collected',
  'unknown_question',
] as const;

export interface JevRuleContext {
  questionKeys: readonly string[];
  documentKinds: readonly string[];
  benefitTiers: readonly string[];
  payoutOptions: readonly string[];
}

export interface JevRuleError {
  index: number;
  rule_id: string | null;
  /** Dotted path inside the rule, e.g. "check.all.1.pattern". */
  path: string;
  message: string;
}

export type JevRulesValidation = { ok: true; rules: JevRule[] } | { ok: false; errors: JevRuleError[] };
