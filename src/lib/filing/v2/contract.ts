/**
 * One-click filing: the member API contract (web cookie and app bearer token
 * alike, through getRequestUser). CONTRACT (read-only for builders; only the
 * contract reviewer and the integrator change it). Design and the reasons for
 * every rule here: docs/designs/one-click-filing.md.
 *
 * The canonical packet and zod schemas for every member request and
 * response. Re-exports ./contract-base.ts (statuses, state machine, lanes,
 * limits, errors) and ./contract-spec.ts (spec and policy content). Staff
 * API: ./contract-staff.ts.
 *
 * No user-facing copy lives here except FILING_ERROR_MESSAGES (plain, short,
 * copy-guard safe). Imports zod and relative paths only, so the native app
 * can share this file later.
 */
import { z } from 'zod';
import { JEV_MODES, JEV_OUTCOMES, JevIssueSchema } from '../../jev/types';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_MAX_BYTES,
  FILING_API_VERSION,
  FILING_ERROR_CODES,
  LANES,
  MAX_ANSWER_KEYS,
  MAX_DOCUMENTS_PER_CLAIM,
  MEMBER_LANE_REASONS,
  PACKET_FORMAT,
  PACKET_STATUSES,
} from './contract-base';
import {
  DOCUMENT_MIME_TYPES,
  IsoDateSchema,
  IsoDateTimeSchema,
  KeySchema,
  PacketPathSchema,
  QUESTION_TYPES,
  Sha256HexSchema,
  UuidSchema,
} from './contract-spec';

export * from './contract-base';
export * from './contract-spec';

/* -------------------------------------------------------------------------- */
/* The canonical packet (what the member signs; SHA-256 of canonicalJson)     */
/* -------------------------------------------------------------------------- */

/** text-like types are strings (date YYYY-MM-DD, money "12.34"); integer and decimal numbers; yes_no boolean; multi_choice sorted option values. */
export const AnswerValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
export type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

const Name = z.string().trim().min(1).max(200);
export const MemberDraftSchema = z.object({
  legal_name: Name.nullable(),
  first_name: Name.nullable(),
  last_name: Name.nullable(),
  email: z.string().email().max(320).nullable(),
  phone: z.string().max(40).nullable(),
  address: z.object({
    line1: z.string().trim().min(1).max(200).nullable(),
    line2: z.string().trim().max(200).nullable(),
    city: z.string().trim().min(1).max(100).nullable(),
    state: z.string().regex(/^[A-Z]{2}$/).nullable(),
    zip: z.string().regex(/^\d{5}(?:-\d{4})?$/).nullable(),
  }),
});
export type MemberDraft = z.infer<typeof MemberDraftSchema>;

export const PacketDocumentSchema = z.object({
  id: UuidSchema,
  kind: KeySchema,
  sha256: Sha256HexSchema,
  mime: z.enum(DOCUMENT_MIME_TYPES),
  size_bytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
});

/** The packet as it stands while the member fills it (Jev reads this). */
export const PacketDraftSchema = z.object({
  format: z.literal(PACKET_FORMAT),
  claim_id: UuidSchema,
  lawsuit_id: UuidSchema,
  spec: z.object({ id: UuidSchema, version: z.number().int().min(1) }).nullable(),
  member: MemberDraftSchema,
  answers: z.record(KeySchema, AnswerValueSchema),
  benefit_tier: KeySchema.nullable(),
  payout_method: KeySchema.nullable(),
  /** Stored member documents only, sorted by kind, then sha256, then id. */
  documents: z.array(PacketDocumentSchema).max(MAX_DOCUMENTS_PER_CLAIM),
  confirmations: z.object({ class_definition: z.boolean(), health_data_consent: z.boolean().nullable() }),
  class_definition_sha256: Sha256HexSchema.nullable(),
  attestation_sha256: Sha256HexSchema.nullable(),
});
export type PacketDraft = z.infer<typeof PacketDraftSchema>;

/**
 * What the member signs. canonicalJson (src/lib/filing/v2/packet.ts) sorts
 * object keys, keeps array order, has no whitespace and drops nothing; the
 * hash is SHA-256 of its UTF-8 bytes, lowercase hex. Only fields that change
 * when the member's claim changes are in it (no titles, no URLs: the spec
 * version fixes those). claim_signatures stores this exact text.
 */
export const CanonicalPacketSchema = PacketDraftSchema.extend({
  spec: z.object({ id: UuidSchema, version: z.number().int().min(1) }),
  member: MemberDraftSchema.extend({
    legal_name: Name,
    email: z.string().email().max(320),
    address: MemberDraftSchema.shape.address.extend({
      line1: z.string().trim().min(1).max(200),
      city: z.string().trim().min(1).max(100),
      state: z.string().regex(/^[A-Z]{2}$/),
      zip: z.string().regex(/^\d{5}(?:-\d{4})?$/),
    }),
  }),
  answers: z.record(KeySchema, AnswerValueSchema.refine((v) => v !== null, 'No empty answers in a signed packet')),
  confirmations: z.object({ class_definition: z.literal(true), health_data_consent: z.boolean().nullable() }),
  class_definition_sha256: Sha256HexSchema,
  attestation_sha256: Sha256HexSchema,
}).strict();
export type CanonicalPacket = z.infer<typeof CanonicalPacketSchema>;

/* -------------------------------------------------------------------------- */
/* Member requests                                                            */
/* -------------------------------------------------------------------------- */

/** POST /api/filing/claims: start or resume one-click on a settlement. */
export const StartFilingRequestSchema = z.object({ lawsuit_id: UuidSchema }).strict();
/** GET /api/filing/claims/preview?lawsuit_id=: the lane, without writing anything. */
export const LanePreviewQuerySchema = z.object({ lawsuit_id: UuidSchema }).strict();

/** PATCH /api/filing/claims/{claimId}/packet. null clears an answer. */
export const UpdatePacketRequestSchema = z
  .object({
    /** The packet revision the client saw (409 revision_conflict otherwise). */
    revision: z.number().int().min(1),
    answers: z
      .record(KeySchema, AnswerValueSchema)
      .refine((a) => Object.keys(a).length <= MAX_ANSWER_KEYS, `At most ${MAX_ANSWER_KEYS} answers`)
      .optional(),
    member: MemberDraftSchema.omit({ address: true })
      .partial()
      .extend({ address: MemberDraftSchema.shape.address.partial().optional() })
      .strict()
      .optional(),
    /** Save the member fields back to the profile (the member's consent; sets prefill_consent_at). */
    save_member_to_profile: z.boolean().optional(),
    benefit_tier: KeySchema.nullable().optional(),
    payout_method: KeySchema.nullable().optional(),
    /** Only ever true when the member ticked "This describes me" themselves. */
    class_definition_confirmed: z.boolean().optional(),
    /** The member's answer to the policy's health consent text. */
    health_consent: z.boolean().optional(),
  })
  .strict();
export type UpdatePacketRequest = z.infer<typeof UpdatePacketRequestSchema>;

/** POST /api/filing/claims/{claimId}/documents: ask for an upload slot. No file names (they leak data). */
export const CreateDocumentRequestSchema = z
  .object({ kind: KeySchema, mime: z.enum(DOCUMENT_MIME_TYPES), size_bytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES) })
  .strict();

/** POST /api/filing/claims/{claimId}/esign-consent (DELETE withdraws it). */
export const EsignConsentRequestSchema = z.object({ accepted: z.literal(true), text_version: z.string().min(1).max(64) }).strict();

/** POST /api/filing/claims/{claimId}/sign, with the Idempotency-Key header: the one click. */
export const SignRequestSchema = z
  .object({
    packet_hash: Sha256HexSchema,
    revision: z.number().int().min(1),
    spec_id: UuidSchema,
    spec_version: z.number().int().min(1),
    typed_name: z.string().trim().min(2).max(200),
    /** The member ticked the sworn statement themselves (never pre-ticked). */
    attestation_accepted: z.literal(true),
    /** The member accepted Lawsuit AI's agent authorization text of this version. */
    authorization_accepted: z.literal(true),
    authorization_text_version: z.string().min(1).max(64),
  })
  .strict();
export type SignRequest = z.infer<typeof SignRequestSchema>;

/** POST /api/filing/claims/{claimId}/withdraw. */
export const WithdrawRequestSchema = z
  .object({ reason: z.enum(['changed_mind', 'filed_myself', 'not_eligible', 'other']).default('changed_mind') })
  .strict();
/** POST .../self-file and POST .../reopen take an empty object. */
export const EmptyRequestSchema = z.object({}).strict();
/** POST /api/filing/claims/{claimId}/confirmation: the administrator's number, as the member got it. */
export const ConfirmationRequestSchema = z.object({ confirmation_number: z.string().trim().min(1).max(100) }).strict();

/* -------------------------------------------------------------------------- */
/* Member responses                                                           */
/* -------------------------------------------------------------------------- */

export const JevIssueViewSchema = JevIssueSchema.omit({ audience: true });
export type JevIssueView = z.infer<typeof JevIssueViewSchema>;

export const FilingErrorBodySchema = z.object({
  error: z.string(),
  code: z.enum(FILING_ERROR_CODES),
  issues: z.array(JevIssueViewSchema).optional(),
  fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  retry_after: z.number().int().optional(),
});
export type FilingErrorBody = z.infer<typeof FilingErrorBodySchema>;

export const LaneViewSchema = z.object({
  lane: z.enum(LANES),
  agent: z.boolean(),
  reasons: z.array(z.enum(MEMBER_LANE_REASONS)),
  /** Last day Lawsuit AI can still take the claim on (the channel's cutoff); null on self_file. */
  last_day_for_agent: IsoDateSchema.nullable(),
  deadline: IsoDateSchema.nullable(),
});
export type LaneView = z.infer<typeof LaneViewSchema>;

export const DocumentViewSchema = z.object({
  id: UuidSchema,
  kind: KeySchema,
  status: z.enum(DOCUMENT_STATUSES),
  mime: z.enum(DOCUMENT_MIME_TYPES),
  size_bytes: z.number().int(),
  sha256: Sha256HexSchema.nullable(),
  created_at: IsoDateTimeSchema,
  stored_at: IsoDateTimeSchema.nullable(),
});
export type DocumentView = z.infer<typeof DocumentViewSchema>;

export const PacketItemViewSchema = z.object({
  path: PacketPathSchema,
  kind: z.enum(['member', 'question', 'choice', 'document']),
  /** The official form's wording when the spec has it. */
  label: z.string(),
  help: z.string().nullable(),
  type: z.enum([...QUESTION_TYPES, 'document'] as const),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
  value: AnswerValueSchema,
  missing: z.boolean(),
  health_flag: z.boolean(),
  locked: z.enum(['packet_signed', 'health_consent_needed', 'not_collected']).nullable(),
  issues: z.array(JevIssueViewSchema),
  /** Document items only. */
  proof: z
    .object({
      min_files: z.number().int(),
      max_files: z.number().int(),
      accepted_mime: z.array(z.enum(DOCUMENT_MIME_TYPES)),
      documents: z.array(DocumentViewSchema),
    })
    .nullable(),
});
export type PacketItemView = z.infer<typeof PacketItemViewSchema>;

export const PacketViewSchema = z.object({
  id: UuidSchema,
  status: z.enum(PACKET_STATUSES),
  revision: z.number().int(),
  /** Set when the packet is complete: what the member would sign. */
  packet_hash: Sha256HexSchema.nullable(),
  complete: z.boolean(),
  spec: z
    .object({
      id: UuidSchema,
      version: z.number().int(),
      official_form_url: z.string(),
      form_title: z.string().nullable(),
      class_definition: z.object({ text: z.string(), source_url: z.string() }),
      /** The sworn statement, verbatim. */
      attestation_text: z.string(),
      benefit_tiers: z.array(z.object({ key: z.string(), label: z.string(), description: z.string().nullable() })),
      payout_options: z.array(z.object({ value: z.string(), label: z.string() })),
    })
    .nullable(),
  /** In the official form's field order. */
  items: z.array(PacketItemViewSchema),
  choices: z.object({
    benefit_tier: z.string().nullable(),
    payout_method: z.string().nullable(),
    class_definition_confirmed: z.boolean(),
    health_consent: z.boolean().nullable(),
  }),
  /** The law firm's consent text, when this claim needs it. */
  health_consent_text: z.string().nullable(),
  jev: z
    .object({ mode: z.enum(JEV_MODES), outcome: z.enum(JEV_OUTCOMES), evaluated_at: IsoDateTimeSchema, issues: z.array(JevIssueViewSchema) })
    .nullable(),
  save_member_to_profile_available: z.boolean(),
});
export type PacketView = z.infer<typeof PacketViewSchema>;

export const TimelineEntrySchema = z.object({
  at: IsoDateTimeSchema,
  /** claim_events.to_status; legacy values may appear on old claims. */
  status: z.string(),
  from: z.string().nullable(),
  /** user -> you; system and staff -> claimmatch. Staff are never named. */
  actor: z.enum(['you', 'claimmatch']),
  action: z.string().nullable(),
  confirmation_number: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const FilingActionsSchema = z.object({
  can_edit: z.boolean(),
  can_upload: z.boolean(),
  can_sign: z.boolean(),
  can_reopen: z.boolean(),
  can_withdraw: z.boolean(),
  can_self_file: z.boolean(),
  can_add_confirmation: z.boolean(),
  needs_esign_consent: z.boolean(),
  /** The session has no real sign-in within REAUTH_MAX_AGE_SECONDS: ask for the password before signing. */
  needs_fresh_sign_in: z.boolean(),
});

export const ClaimFilingViewSchema = z.object({
  api_version: z.literal(FILING_API_VERSION),
  server_time: IsoDateTimeSchema,
  claim: z.object({
    id: UuidSchema,
    lawsuit_id: UuidSchema,
    status: z.string(),
    confirmation_number: z.string().nullable(),
    updated_at: IsoDateTimeSchema,
  }),
  settlement: z.object({
    id: UuidSchema,
    slug: z.string(),
    title: z.string(),
    deadline: IsoDateSchema.nullable(),
    deadline_passed: z.boolean(),
    official_url: z.string().nullable(),
  }),
  lane: LaneViewSchema,
  packet: PacketViewSchema.nullable(),
  timeline: z.array(TimelineEntrySchema),
  actions: FilingActionsSchema,
  esign: z.object({ text_version: z.string(), text: z.string(), consented: z.boolean() }),
  /** Lawsuit AI's agent authorization (law-firm approved); agent lanes only. */
  authorization: z.object({ text_version: z.string(), text: z.string() }).nullable(),
  /** The live signature, if any. */
  signature: z
    .object({ id: UuidSchema, signed_at: IsoDateTimeSchema, typed_name: z.string(), packet_hash: Sha256HexSchema, lane: z.enum(LANES) })
    .nullable(),
});
export type ClaimFilingView = z.infer<typeof ClaimFilingViewSchema>;

export const ClaimFilingSummarySchema = z.object({
  claim_id: UuidSchema,
  lawsuit_id: UuidSchema,
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  lane: z.enum(LANES),
  agent: z.boolean(),
  deadline: IsoDateSchema.nullable(),
  confirmation_number: z.string().nullable(),
  /** The member has something to do (preparing, ready, needs_you, filing_rejected). */
  needs_action: z.boolean(),
  updated_at: IsoDateTimeSchema,
});
export type ClaimFilingSummary = z.infer<typeof ClaimFilingSummarySchema>;

export const ClaimFilingResponseSchema = z.object({ filing: ClaimFilingViewSchema });
export const ClaimFilingListResponseSchema = z.object({ items: z.array(ClaimFilingSummarySchema) });
export const LanePreviewResponseSchema = z.object({
  preview: z.object({ lawsuit_id: UuidSchema, lane: LaneViewSchema, claim_id: UuidSchema.nullable(), can_start: z.boolean() }),
});
export const DocumentSlotResponseSchema = z.object({
  document: DocumentViewSchema,
  /** supabase-js storage.uploadToSignedUrl(path, token, file), or PUT signed_url. */
  upload: z.object({ signed_url: z.string().url(), token: z.string(), path: z.string(), expires_at: IsoDateTimeSchema }),
});
export const DocumentResponseSchema = z.object({ document: DocumentViewSchema });
export const DownloadResponseSchema = z.object({ url: z.string().url(), expires_at: IsoDateTimeSchema });
export const EsignConsentResponseSchema = z.object({
  consent: z.object({ id: UuidSchema, text_version: z.string(), consented_at: IsoDateTimeSchema, withdrawn_at: IsoDateTimeSchema.nullable() }),
});
