import type { ClaimView } from '@shared/lib/claims';
import { matchStrengthLabel } from '@shared/lib/matching';
import type { ClaimScreenResponse, DashboardResponse } from '@shared/lib/mobile-contract';
import type { EligibilityCriteria, Lawsuit } from '@shared/lib/types';
import { z } from 'zod';

import { isClaimHref } from '@/features/shared/hrefs';

import { invalidResponse } from './errors';

/**
 * Response shapes, checked where data enters the app, so a malformed answer
 * becomes an error state instead of a crash. Each schema checks the
 * discriminators and the fields screens read; unknown fields are dropped
 * (zod's default), so a field added on the server never reaches a screen
 * unreviewed (for example a match score).
 */

const nullableText = z.string().nullable();
/** For catalog fields a card can show without: a malformed value reads as missing. */
const lenientText = z.string().nullable().catch(null);

// ---------------------------------------------------------------------------
// Catalog rows (direct Supabase reads)
// ---------------------------------------------------------------------------

/** The catalog columns the app reads (CATALOG_COLUMNS in ./catalog). */
export type CatalogLawsuit = Pick<
  Lawsuit,
  | 'id'
  | 'slug'
  | 'title'
  | 'summary'
  | 'description'
  | 'category'
  | 'status'
  | 'review_status'
  | 'typical_payout'
  | 'proof_required'
  | 'deadline'
  | 'eligibility'
  | 'eligibility_text'
  | 'source_url'
  | 'claim_url'
  | 'external_id'
  | 'is_featured'
  | 'administrator'
  | 'verified_at'
  | 'eligibility_verified'
  | 'proof_verified'
>;

/**
 * Identity, status and deadline must be right (they decide whether a row is
 * open for claims); the rest degrades to "not stated".
 */
const catalogRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string(),
  status: z.enum(['open', 'closing_soon', 'closed', 'draft']),
  review_status: z.enum(['draft', 'pending_review', 'published', 'rejected']),
  deadline: nullableText,
  summary: lenientText,
  description: lenientText,
  typical_payout: lenientText,
  proof_required: z.boolean().catch(false),
  eligibility: z
    .record(z.string(), z.unknown())
    .catch({})
    .transform((value) => value as EligibilityCriteria),
  eligibility_text: lenientText,
  source_url: lenientText,
  claim_url: lenientText,
  external_id: lenientText,
  is_featured: z.boolean().catch(false),
  administrator: lenientText,
  verified_at: lenientText,
  eligibility_verified: lenientText,
  proof_verified: z.enum(['yes', 'no', 'optional', 'unknown']).nullable().catch(null),
});

/** One catalog row, or null when it cannot be shown. */
export function parseCatalogRow(row: unknown): CatalogLawsuit | null {
  const parsed = catalogRowSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/** The rows that can be shown. A list answer that is not an array is an error. */
export function parseCatalogRows(data: unknown): CatalogLawsuit[] {
  if (!Array.isArray(data)) throw invalidResponse();
  return data.flatMap((row) => {
    const parsed = parseCatalogRow(row);
    return parsed ? [parsed] : [];
  });
}

// ---------------------------------------------------------------------------
// Claims (web API)
// ---------------------------------------------------------------------------

export const claimViewSchema = z.object({
  id: z.string().min(1),
  lawsuit_id: z.string().min(1),
  lawsuit_title: z.string(),
  status: z.string(),
  confirmation_number: nullableText,
  reported_filed_at: nullableText,
  user_filed_on: nullableText,
  corrective_notice_answered_at: nullableText,
  corrective_notice_required: z.boolean(),
  created_at: nullableText,
}) satisfies z.ZodType<ClaimView>;

const settlementContextSchema = z.object({
  known: z.boolean(),
  fictional: z.boolean(),
  published: z.boolean(),
  closedByStatus: z.boolean(),
  deadline: nullableText,
  deadlinePassed: z.boolean(),
  openForClaims: z.boolean(),
  lateReportOpen: z.boolean(),
});

const flowSettlementSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  deadline: nullableText,
  officialUrl: nullableText,
  sourceUrl: nullableText,
  sourceHost: nullableText,
  eligibility: nullableText,
  proof: z.enum(['required', 'optional', 'none', 'unknown']),
  formFieldOrder: z.array(z.string()).nullable().optional(),
  assistedFilingAllowed: z.boolean().optional(),
  payoutReportEnabled: z.boolean().optional(),
});

const packetProfileSchema = z.object({
  full_name: nullableText,
  email: nullableText,
  phone: nullableText,
  address_line1: nullableText,
  address_line2: nullableText,
  city: nullableText,
  state: nullableText,
  prefill_consent_at: nullableText,
});

const claimScreenSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('closed'),
    slug: z.string().min(1),
    title: z.string(),
    category: nullableText,
    deadline: nullableText,
    deadlinePassed: z.boolean(),
    officialUrl: nullableText,
  }),
  z.object({
    kind: z.literal('flow'),
    now: z.string(),
    slug: z.string().min(1),
    title: z.string(),
    category: nullableText,
    settlement: flowSettlementSchema,
    context: settlementContextSchema,
    claim: claimViewSchema.nullable(),
    profile: packetProfileSchema.nullable(),
  }),
]);

/** GET /api/mobile/claim/[slug], status 200. Throws when the shape is wrong. */
export function parseClaimScreenResponse(json: unknown): ClaimScreenResponse {
  return claimScreenSchema.parse(json);
}

/** POST /api/claims. */
export const startTrackingResponseSchema = z.object({ claim: claimViewSchema, created: z.boolean() });
/** PATCH /api/claims/[id]. */
export const claimChangeResponseSchema = z.object({ claim: claimViewSchema, changed: z.boolean() });
/** POST /api/claims/acknowledge-fictional. */
export const acknowledgeFictionalResponseSchema = z.object({
  claims: z.array(claimViewSchema),
  acknowledged: z.number().int().nonnegative(),
});
/** POST /api/settings and POST /api/account/delete. */
export const okResponseSchema = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------
// Dashboard (web API)
// ---------------------------------------------------------------------------

const dashboardRowSchema = z.object({
  claimId: z.string().min(1),
  title: z.string(),
  label: z.string(),
  // Presentation only: an unknown tone or group shows as neutral "Status unavailable".
  tone: z.enum(['amber', 'brand', 'green', 'gray', 'red']).catch('gray'),
  group: z.enum(['needs_filing', 'reported', 'submitted', 'closed', 'other']).catch('other'),
  deadlineText: z.string(),
  nextStep: z.string(),
  // The router opens other URLs outside the app: only "/claim/{slug}" keeps its button.
  action: z
    .object({ label: z.string(), href: z.string() })
    .nullable()
    .transform((action) => (action && isClaimHref(action.href) ? action : null)),
});

const noticeItemSchema = z.object({
  claimId: z.string().min(1),
  title: z.string(),
  kind: z.enum(['legacy', 'fictional']),
  deadline: nullableText,
  deadlinePassed: z.boolean(),
  filing: z.enum(['open', 'closed_on_list', 'unlisted', 'deadline_passed']),
  officialUrl: nullableText,
});

/** The label is rebuilt from the strength: only "Strong match" or "Possible match" is ever shown. */
const appMatchSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string(),
    deadlineText: z.string(),
    reasons: z.array(z.string()),
    strength: z.enum(['strong', 'possible']),
    officialUrl: nullableText,
  })
  .transform((match) => ({ ...match, label: matchStrengthLabel(match.strength) }));

const closingSoonItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  deadline: z.string(),
  deadlineText: z.string(),
  officialUrl: nullableText,
});

const reminderSchema = z.object({
  claimId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  deadline: z.string(),
});

const dashboardSchema = z.object({
  serverTime: z.string(),
  profile: z.object({ firstName: z.string(), onboarded: z.boolean(), needsProfile: z.boolean() }),
  claims: z.object({
    failed: z.boolean(),
    rows: z.array(dashboardRowSchema),
    notices: z.array(noticeItemSchema),
  }),
  matches: z.object({
    failed: z.boolean(),
    strong: z.array(appMatchSchema),
    possible: z.array(appMatchSchema),
    possibleHidden: z.number().int().nonnegative(),
  }),
  closingSoon: z.object({ failed: z.boolean(), items: z.array(closingSoonItemSchema) }),
  reminders: z.array(reminderSchema),
});

/** GET /api/mobile/dashboard, status 200. Throws when the shape is wrong. */
export function parseDashboardResponse(json: unknown): DashboardResponse {
  return dashboardSchema.parse(json);
}

// ---------------------------------------------------------------------------
// Profile (direct Supabase read)
// ---------------------------------------------------------------------------

/** The profile row's own columns; the matching answers arrive one per column (PROFILE_COLUMNS in ./profile). */
export const profileRowSchema = z.object({
  full_name: nullableText,
  state: nullableText,
  phone: nullableText,
  address_line1: nullableText,
  address_line2: nullableText,
  city: nullableText,
  email_opt_in: z.boolean(),
  onboarded: z.boolean(),
  prefill_consent_at: nullableText,
  match_metrics_consent_at: nullableText,
  referral_code: nullableText,
});
