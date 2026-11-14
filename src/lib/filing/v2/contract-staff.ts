/**
 * One-click filing: the staff and law-firm API contract (/api/admin/filing/**,
 * cookie sessions only, roles from src/lib/staff-roles.ts). CONTRACT
 * (read-only for builders). Every response that shows a member's personal
 * data is written to filing_audit_log first (recordStaffAccess).
 * Design: docs/designs/one-click-filing.md, sections 10 and 11.
 */
import { z } from 'zod';
import { JevIssueSchema } from '../../jev/types';
import {
  AGENT_CHANNELS,
  AGENT_FILING_VALUES,
  DOCUMENT_MIME_TYPES,
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  JOB_STATUSES,
  LANE_REASON_CODES,
  LANES,
  POLICY_STATUSES,
  PacketPathSchema,
  SPEC_STATUSES,
  Sha256HexSchema,
  SourceReviewedSchema,
  UuidSchema,
} from './contract';

export const STAFF_ROLES = ['legal_reviewer', 'filing_agent'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** filing_audit_log.action values. */
export const STAFF_AUDIT_ACTIONS = [
  'view_packet',
  'view_document',
  'export_bulk',
  'take_job',
  'record_result',
  'resolve_job',
  'record_bulk_results',
  'draft_policy',
  'approve_policy',
  'reject_policy',
  'draft_spec',
  'approve_spec',
  'retire_spec',
  'kill_switch_on',
  'kill_switch_off',
  'objection_recorded',
  'objection_cleared',
  'grant_role',
  'revoke_role',
] as const;
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

export const TargetSchema = z.union([
  z.object({ lawsuit_id: UuidSchema }).strict(),
  z.object({ administrator_id: UuidSchema }).strict(),
]);
export type FilingTarget = z.infer<typeof TargetSchema>;

const Notes = z.string().trim().min(1).max(5000);
const Reason = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'Use a lowercase reason code');

/* Policies -------------------------------------------------------------------- */

/** POST /api/admin/filing/policies: create the target's draft (or replace its content). */
export const UpsertPolicyDraftRequestSchema = z
  .object({ target: TargetSchema, content: FilingPolicyContentSchema, copy_from_policy_id: UuidSchema.optional() })
  .strict();
/** PATCH /api/admin/filing/policies/{policyId}: edit a draft; updated_at guards against lost updates. */
export const UpdatePolicyDraftRequestSchema = z.object({ content: FilingPolicyContentSchema, updated_at: IsoDateTimeSchema }).strict();
/**
 * POST .../policies/{id}/approve and .../specs/{id}/approve (legal_reviewer only).
 * expected_updated_at: the draft's updated_at as the reviewer read it. A draft
 * edited since then is refused (409 revision_conflict), so an approval always
 * covers the version the law firm actually reviewed.
 */
export const ApproveRequestSchema = z
  .object({
    notes: Notes,
    documents_reviewed: z.array(SourceReviewedSchema).min(1).max(50),
    confirm: z.literal(true),
    expected_updated_at: IsoDateTimeSchema,
  })
  .strict();
/** POST .../policies/{id}/reject (legal_reviewer only). */
export const RejectRequestSchema = z.object({ notes: Notes }).strict();

export const PolicyRecordViewSchema = z.object({
  id: UuidSchema,
  target: TargetSchema,
  version: z.number().int(),
  status: z.enum(POLICY_STATUSES),
  content: FilingPolicyContentSchema,
  created_by: UuidSchema.nullable(),
  created_at: IsoDateTimeSchema,
  updated_by: UuidSchema.nullable(),
  updated_at: IsoDateTimeSchema,
  approved_by: UuidSchema.nullable(),
  approved_at: IsoDateTimeSchema.nullable(),
  approval_notes: z.string().nullable(),
  documents_reviewed: z.array(SourceReviewedSchema).nullable(),
  rejected_by: UuidSchema.nullable(),
  rejected_at: IsoDateTimeSchema.nullable(),
  rejection_notes: z.string().nullable(),
});
export const PolicyResponseSchema = z.object({ policy: PolicyRecordViewSchema });

/* Controls: take effect at once ------------------------------------------------ */

/** POST /api/admin/filing/controls/kill-switch. On: any staff or admin. Off: legal_reviewer only. */
export const KillSwitchRequestSchema = z
  .object({ target: TargetSchema, active: z.boolean(), reason: z.string().trim().min(1).max(1000) })
  .strict();
/** POST /api/admin/filing/controls/objection. Record: any staff. Clear (received_at null): legal_reviewer only. */
export const ObjectionRequestSchema = z
  .object({ target: TargetSchema, received_at: IsoDateTimeSchema.nullable(), notes: z.string().trim().max(5000).nullable() })
  .strict();
export const ControlsViewSchema = z.object({
  target: TargetSchema,
  kill_switch: z.boolean(),
  kill_switch_reason: z.string().nullable(),
  kill_switch_changed_at: IsoDateTimeSchema.nullable(),
  objection_received_at: IsoDateTimeSchema.nullable(),
  objection_notes: z.string().nullable(),
});
export const ControlsResponseSchema = z.object({ controls: ControlsViewSchema });

/* Specs ------------------------------------------------------------------------ */

/** POST /api/admin/filing/specs: a new draft version (copied from an existing one, or given). */
export const CreateSpecDraftRequestSchema = z
  .object({ lawsuit_id: UuidSchema, copy_from_spec_id: UuidSchema.optional(), content: FilingSpecContentSchema.optional() })
  .strict()
  .refine((r) => Boolean(r.copy_from_spec_id) !== Boolean(r.content), 'Give content or copy_from_spec_id, not both');
/** PATCH /api/admin/filing/specs/{specId}. */
export const UpdateSpecDraftRequestSchema = z.object({ content: FilingSpecContentSchema, updated_at: IsoDateTimeSchema }).strict();
/** POST /api/admin/filing/specs/{specId}/retire (legal_reviewer): signed packets on it go back to the member. */
export const RetireSpecRequestSchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();

export const SpecRecordViewSchema = z.object({
  id: UuidSchema,
  lawsuit_id: UuidSchema,
  version: z.number().int(),
  status: z.enum(SPEC_STATUSES),
  content: FilingSpecContentSchema,
  created_by: UuidSchema.nullable(),
  created_at: IsoDateTimeSchema,
  updated_by: UuidSchema.nullable(),
  updated_at: IsoDateTimeSchema,
  approved_by: UuidSchema.nullable(),
  approved_at: IsoDateTimeSchema.nullable(),
  approval_notes: z.string().nullable(),
  documents_reviewed: z.array(SourceReviewedSchema).nullable(),
  retired_at: IsoDateTimeSchema.nullable(),
  retire_reason: z.string().nullable(),
});
export const SpecResponseSchema = z.object({ spec: SpecRecordViewSchema });
/** POST /api/admin/filing/specs/{specId}/validate: the schema and validateJevRules, nothing stored. */
export const SpecValidationResponseSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});

/* Settlements overview ---------------------------------------------------------- */

/** GET /api/admin/filing/settlements?q=&filter=&cursor=&limit= */
export const SettlementListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    filter: z.enum(['all', 'agent_enabled', 'needs_review', 'kill_switch']).default('all'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const SettlementFilingSummarySchema = z.object({
  lawsuit_id: UuidSchema,
  slug: z.string(),
  title: z.string(),
  deadline: IsoDateSchema.nullable(),
  administrator: z.object({ id: UuidSchema, slug: z.string(), name: z.string() }).nullable(),
  agent_filing: z.enum(AGENT_FILING_VALUES),
  channels_enabled: z.array(z.enum(AGENT_CHANNELS)),
  /** chooseLane for a member with no state restriction issue, today. */
  lane_preview: z.enum(LANES),
  lane_reasons: z.array(z.enum(LANE_REASON_CODES)),
  kill_switch: z.boolean(),
  objection: z.boolean(),
  policy: z.object({ approved_version: z.number().int().nullable(), draft_version: z.number().int().nullable() }),
  spec: z.object({ approved_version: z.number().int().nullable(), draft_version: z.number().int().nullable() }),
  open_jobs: z.number().int(),
});
export const SettlementListResponseSchema = z.object({
  items: z.array(SettlementFilingSummarySchema),
  next_cursor: z.string().nullable(),
});
/** GET /api/admin/filing/settlements/{lawsuitId} */
export const SettlementFilingDetailResponseSchema = z.object({
  summary: SettlementFilingSummarySchema,
  policies: z.array(PolicyRecordViewSchema),
  administrator_policies: z.array(PolicyRecordViewSchema),
  specs: z.array(SpecRecordViewSchema),
  controls: z.array(ControlsViewSchema),
});

/* Jobs and the desk --------------------------------------------------------------- */

/** GET /api/admin/filing/jobs?status=&channel=&lawsuit_id=&cursor=&limit= (no personal data in the list). */
export const JobListQuerySchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
    channel: z.enum(AGENT_CHANNELS).optional(),
    lawsuit_id: UuidSchema.optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const JobSummarySchema = z.object({
  id: UuidSchema,
  claim_id: UuidSchema,
  lawsuit_id: UuidSchema,
  settlement_title: z.string(),
  channel: z.enum(AGENT_CHANNELS),
  status: z.enum(JOB_STATUSES),
  due_by: IsoDateTimeSchema.nullable(),
  deadline: IsoDateSchema.nullable(),
  attempt: z.number().int(),
  locked: z.boolean(),
  locked_by_me: z.boolean(),
  needs_attention_reason: z.string().nullable(),
  created_at: IsoDateTimeSchema,
});
export const JobListResponseSchema = z.object({ items: z.array(JobSummarySchema), next_cursor: z.string().nullable() });

/**
 * The desk screen for one job (GET /api/admin/filing/jobs/{jobId}, or the
 * result of POST /api/admin/filing/desk/next). The signed packet in the
 * official form's field order, with copy values. Staff file in their own
 * normal browser: nothing here opens, embeds, scripts or proxies the official site.
 */
export const DeskPacketViewSchema = z.object({
  job: JobSummarySchema,
  claim: z.object({ id: UuidSchema, status: z.string() }),
  settlement: z.object({ title: z.string(), official_form_url: z.string(), deadline: IsoDateSchema.nullable() }),
  signature: z.object({
    id: UuidSchema,
    typed_name: z.string(),
    signed_at: IsoDateTimeSchema,
    packet_hash: Sha256HexSchema,
    statement_text: z.string(),
    lane: z.enum(LANES),
  }),
  /** Every packet field, in form_field_order (then the rest); copy_text is exactly what to paste. */
  fields: z.array(
    z.object({ path: PacketPathSchema, label: z.string(), copy_text: z.string(), required: z.boolean() }),
  ),
  documents: z.array(
    z.object({
      id: UuidSchema,
      kind: z.string(),
      label: z.string(),
      mime: z.enum(DOCUMENT_MIME_TYPES),
      size_bytes: z.number().int(),
      sha256: Sha256HexSchema,
    }),
  ),
  instructions: z.string().nullable(),
  /** pre_send Jev result, staff-audience issues included. */
  checks: z.object({ outcome: z.enum(['pass', 'warn', 'block']), issues: z.array(JevIssueSchema) }),
  lock: z.object({ mine: z.boolean(), expires_at: IsoDateTimeSchema.nullable() }),
});
export type DeskPacketView = z.infer<typeof DeskPacketViewSchema>;
export const DeskNextResponseSchema = z.object({ job: DeskPacketViewSchema.nullable() });
export const DeskJobResponseSchema = z.object({ job: DeskPacketViewSchema });

/**
 * POST /api/admin/filing/jobs/{jobId}/result, by the lock holder:
 *   filed                 submitted on the official site; with the number -> claim submitted, else filed_by_claimmatch
 *   rejected              the official site or administrator refused it -> claim filing_rejected
 *   not_submitted         nothing was sent; release the job -> claim queued
 *   needs_member          nothing was sent; the member must add or fix something -> needs_you (signature voided)
 *   stopped_at_challenge  the site showed a CAPTCHA, code or identity check: stop, hand back -> self_file
 *   needs_attention       unsure whether it went through: never retried automatically
 */
export const RecordResultRequestSchema = z
  .object({
    outcome: z.enum(['filed', 'rejected', 'not_submitted', 'needs_member', 'stopped_at_challenge', 'needs_attention']),
    confirmation_number: z.string().trim().min(1).max(100).nullable().default(null),
    /** Evidence screenshots already uploaded through .../evidence. */
    evidence_document_ids: z.array(UuidSchema).max(5).default([]),
    reason_code: Reason.nullable().default(null),
    /** Staff-only; never shown to the member. */
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.confirmation_number && r.outcome !== 'filed') {
      ctx.addIssue({ code: 'custom', path: ['confirmation_number'], message: 'Only a filed claim has a confirmation number' });
    }
    if ((r.outcome === 'rejected' || r.outcome === 'needs_attention') && !r.reason_code) {
      ctx.addIssue({ code: 'custom', path: ['reason_code'], message: 'Say why' });
    }
  });
export type RecordResultRequest = z.infer<typeof RecordResultRequestSchema>;

/** POST /api/admin/filing/jobs/{jobId}/evidence: an upload slot for a confirmation screenshot. */
export const EvidenceUploadRequestSchema = z
  .object({ mime: z.enum(['image/png', 'image/jpeg', 'application/pdf']), size_bytes: z.number().int().min(1).max(10 * 1024 * 1024) })
  .strict();

/** POST /api/admin/filing/jobs/{jobId}/resolve: a needs_attention job, after a person checked. */
export const ResolveJobRequestSchema = z
  .object({
    resolution: z.enum(['requeue_not_submitted', 'filed', 'rejected', 'hand_back_to_member']),
    confirmation_number: z.string().trim().min(1).max(100).nullable().default(null),
    reason_code: Reason,
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

/* Bulk ----------------------------------------------------------------------------- */

/** POST /api/admin/filing/bulk/exports: answers text/csv with X-Export-Batch-Id, X-Export-Rows, X-Export-Sha256. */
export const BulkExportRequestSchema = z
  .object({ lawsuit_id: UuidSchema, max_rows: z.number().int().min(1).max(5000).optional(), confirm: z.literal(true) })
  .strict();
/** POST /api/admin/filing/bulk/exports/{batchId}/results */
export const BulkResultsRequestSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            job_id: UuidSchema,
            outcome: z.enum(['filed', 'rejected', 'needs_attention']),
            confirmation_number: z.string().trim().min(1).max(100).nullable().default(null),
            reason_code: Reason.nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(5000),
  })
  .strict();

/* Roles and audit ---------------------------------------------------------------------- */

/**
 * POST /api/admin/filing/roles (canGrantStaffRole: legal_reviewer only by a legal_reviewer,
 * filing_agent by an admin or a legal_reviewer; nobody grants themself). granted_by is
 * always the caller. DELETE .../roles/{roleId} revokes (canManageStaffRoles).
 */
export const GrantRoleRequestSchema = z
  .object({ email: z.string().trim().email().max(320), role: z.enum(STAFF_ROLES), notes: z.string().trim().max(2000).nullable().default(null) })
  .strict();
export const RoleViewSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  email: z.string().nullable(),
  role: z.enum(STAFF_ROLES),
  granted_by: UuidSchema.nullable(),
  granted_at: IsoDateTimeSchema,
});
export const RoleListResponseSchema = z.object({ roles: z.array(RoleViewSchema) });

/** GET /api/admin/filing/audit?claim_id=&actor_id=&lawsuit_id=&cursor=&limit= (admin or legal_reviewer). */
export const AuditQuerySchema = z
  .object({
    claim_id: UuidSchema.optional(),
    actor_id: UuidSchema.optional(),
    lawsuit_id: UuidSchema.optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export const AuditEntryViewSchema = z.object({
  id: UuidSchema,
  actor_id: UuidSchema,
  actor_roles: z.array(z.string()),
  action: z.string(),
  subject_user_id: UuidSchema.nullable(),
  claim_id: UuidSchema.nullable(),
  job_id: UuidSchema.nullable(),
  lawsuit_id: UuidSchema.nullable(),
  detail: z.record(z.unknown()),
  created_at: IsoDateTimeSchema,
});
export const AuditListResponseSchema = z.object({ entries: z.array(AuditEntryViewSchema), next_cursor: z.string().nullable() });
