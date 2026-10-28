// ClaimMatch — shared domain types. These mirror the SQL schema in
// supabase/migrations/0001_init.sql and are the single source of truth for
// data shapes across the app. Keep in sync with the DB.

/**
 * Claim states (supabase/migrations/0006_claim_states.sql). ClaimMatch never
 * files for anyone: people file on the official site and report it here.
 *
 *   self_file          still needs filing on the official site ("Not filed yet")
 *   reported_filed     the user says they filed, no confirmation number yet
 *   submitted          ONLY with the administrator's confirmation number
 *   not_reported_filed the deadline passed with no report
 *   withdrawn          the user stopped tracking the claim
 *
 * Legacy values: 'processing', 'approved', 'rejected', 'paid', and 'submitted'
 * rows without a confirmation number were written by the retired e-sign flow,
 * which filed nothing. Never read a status directly for display: use
 * displayClaimStatus() from '@/lib/claims'.
 */
export type ClaimStatus =
  | 'self_file'
  | 'reported_filed'
  | 'submitted'
  | 'not_reported_filed'
  | 'withdrawn'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'paid';

export type LawsuitStatus = 'open' | 'closing_soon' | 'closed' | 'draft';

export type ReviewStatus = 'draft' | 'pending_review' | 'published' | 'rejected';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type RecoveryStatus = 'pending' | 'awaiting_payout' | 'paid' | 'denied';

/** A single eligibility question shown during onboarding. */
export interface EligibilityQuestion {
  /** stable slug stored as a key in profiles.attributes */
  key: string;
  label: string;
  type: 'boolean' | 'select' | 'multiselect' | 'state' | 'text' | 'date';
  options?: string[];
  help?: string;
}

/**
 * Whether a claim needs proof (receipts, records), as the source states it.
 * 'unknown' means the source does not say; it must never display as "none".
 */
export type ProofRequired = 'yes' | 'no' | 'optional' | 'unknown';

/** Structured eligibility criteria stored on a lawsuit (lawsuits.eligibility). */
export interface EligibilityCriteria {
  /** US state codes; empty/undefined = nationwide */
  states?: string[];
  /** attribute keys that must be truthy on the profile */
  requires?: string[];
  /** attribute key -> one of these values must match */
  anyOf?: Record<string, (string | boolean)[]>;
  /** purchase/exposure window */
  dateRange?: { from?: string; to?: string };
  /** free notes for the matcher / UI */
  notes?: string;
  /** Proof rule from the source feed (see src/lib/proof.ts). */
  proof?: ProofRequired;
}

export interface Source {
  id: string;
  slug: string;
  name: string;
  homepage_url: string | null;
  adapter: string;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface Lawsuit {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  status: LawsuitStatus;
  typical_payout: string | null;
  payout_min: number | null;
  payout_max: number | null;
  proof_required: boolean;
  deadline: string | null; // ISO date
  eligibility: EligibilityCriteria;
  eligibility_text: string | null;
  source_id: string | null;
  source_url: string | null;
  claim_url: string | null;
  external_id: string | null;
  hero_image_url: string | null;
  is_featured: boolean;
  // Dream-state: extraction provenance + review workflow + value estimate
  review_status: ReviewStatus;
  extraction_confidence: number | null;
  administrator: string | null;
  raw_source_text: string | null;
  estimated_value_min: number | null;
  estimated_value_max: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Last time this row appeared in a successful, non-empty source feed. */
  last_seen_at: string | null;
  /** Consecutive successful feeds this feed-source row was missing from. */
  missed_feed_count: number;
  created_at: string;
  updated_at: string;
  /** 0004_prefill: when the listing was closed. */
  closed_at?: string | null;
  /** 0004_prefill: last time a human or job verified the official notice. */
  last_verified_at?: string | null;
  /** 0013: when an admin marked the listing verified. Badge only if also set. */
  verified_at?: string | null;
  /** 0013: admin who set verified_at. */
  verified_by?: string | null;
  /** 0013: who qualifies, as checked against the official notice. */
  eligibility_verified?: string | null;
  /** 0013: proof rule as checked (yes/no/optional/unknown). */
  proof_verified?: ProofRequired | null;
  /** 0013: optional official-form field order (C10). */
  form_field_order?: string[] | null;
  /** 0015: per-settlement filing marker. User path is gated by the flag. */
  assisted_filing_allowed?: boolean;
  /** 0016: optional FK to public.administrators. */
  administrator_id?: string | null;
  /** 0021: last official-link check. */
  link_status?: 'ok' | 'redirect' | 'broken' | 'timeout' | 'error' | null;
  link_http_status?: number | null;
  link_checked_at?: string | null;
  /** 0023: unknown | allowed | barred. Default unknown. */
  third_party_fee_status?: 'unknown' | 'allowed' | 'barred';
  /** 0023: generated true only when status is allowed. */
  third_party_fee_allowed?: boolean;
}

/** 0014: signed-in crowd signal. Never shown as a public fact. */
export interface ProofFeedback {
  id: string;
  lawsuit_id: string;
  user_id: string;
  answer: 'yes' | 'no' | 'not_sure';
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  state: string | null;
  zip: string | null;
  attributes: Record<string, unknown>;
  email_opt_in: boolean;
  onboarded: boolean;
  is_admin: boolean;
  phone: string | null;
  sms_opt_in: boolean;
  /** 0004_prefill: mailing address for official claim forms. */
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  prefill_consent_at?: string | null;
  referral_code: string | null;
  referred_by: string | null;
  /** 0011_attribution: first-touch campaign fields. Written once. */
  first_utm_source?: string | null;
  first_utm_medium?: string | null;
  first_utm_campaign?: string | null;
  first_utm_content?: string | null;
  first_ref?: string | null;
  /** 0017: when the user agreed to privacy-safe match-quality logging. */
  match_metrics_consent_at?: string | null;
  /** 0020: tester account excluded from traction counts. */
  is_internal?: boolean;
  /** 0020: first-touch soft-launch tag (soft-1, soft-2, …). */
  cohort?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  user_id: string;
  lawsuit_id: string;
  score: number;
  reasons: string[];
  notified_at: string | null;
  dismissed: boolean;
  created_at: string;
  /** joined lawsuit, when selected with a relation */
  lawsuit?: Lawsuit;
}

export interface Claim {
  id: string;
  /** Legacy identity column. Never shown to users. */
  receipt_number: number;
  user_id: string;
  lawsuit_id: string;
  lawsuit_title: string;
  status: ClaimStatus;
  form_data: Record<string, unknown>;
  // Legacy e-sign columns from the retired flow. filed_at was stamped although
  // nothing was ever filed, so none of these are shown or written any more.
  authorized_at: string | null;
  signature_name: string | null;
  authorization_ip: string | null;
  filed_at: string | null;
  estimated_value: number | null;
  // Self-file tracking (0006). Optional because readers must also work against
  // a database where 0006 has not been applied yet.
  /** The settlement administrator's confirmation number, as the user typed it. */
  confirmation_number?: string | null;
  /** When the user told ClaimMatch they filed (server time). */
  reported_filed_at?: string | null;
  /** The day the user says they filed on the official site (YYYY-MM-DD). */
  user_filed_on?: string | null;
  /** When the user answered the Phase 0 corrective notice on a legacy claim. */
  corrective_notice_answered_at?: string | null;
  /** 0007: the retired flow recorded this claim as filed, so the notice applies. */
  corrective_notice_required?: boolean | null;
  /** 0004_prefill: when the user reported a submission (kept beside reported_filed_at). */
  user_submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  /** joined lawsuit, when selected with a relation */
  lawsuit?: Lawsuit;
}

export interface Recovery {
  id: string;
  user_id: string;
  claim_id: string;
  gross_amount: number;
  fee_pct: number;
  fee_amount: number;
  net_amount: number;
  status: RecoveryStatus;
  received_at: string | null;
  paid_out_at: string | null;
  /** 0022: legacy ledger vs user-reported payout. */
  source?: 'legacy' | 'user_reported';
  payout_method?: 'check' | 'card' | 'e_payment' | 'other' | null;
  user_reported_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  type: 'scrape' | 'extract' | 'match' | 'notify' | string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  email: string | null;
  channel: 'email' | 'sms' | string;
  type: string;
  subject: string | null;
  body: string | null;
  status: 'sent' | 'failed' | 'skipped' | string;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  code: string;
  referred_email: string | null;
  referred_user: string | null;
  status: 'pending' | 'signed_up' | 'rewarded' | string;
  created_at: string;
}

/** Structured settlement extracted from unstructured text by the LLM pipeline. */
export interface ExtractedLawsuit {
  title: string;
  summary: string;
  description: string;
  category: string;
  administrator: string | null;
  typical_payout: string;
  estimated_value_min: number | null;
  estimated_value_max: number | null;
  proof_required: boolean;
  deadline: string | null;
  eligibility: EligibilityCriteria;
  eligibility_text: string;
  claim_url: string | null;
  confidence: number; // 0..1
}

export interface Subscriber {
  id: string;
  email: string;
  state: string | null;
  interests: string[];
  confirmed: boolean;
  created_at: string;
}

/**
 * A source's own claim status, mapped by its adapter: 'open' (taking claims),
 * 'closed' (not taking claims) or 'unknown' (the source's status does not say).
 */
export type FeedStatus = 'open' | 'closed' | 'unknown';

/** Normalized record produced by a scraper source adapter. */
export interface ScrapedLawsuit {
  external_id: string;
  title: string;
  summary?: string;
  description?: string;
  category?: string;
  typical_payout?: string;
  proof_required?: boolean;
  deadline?: string | null;
  eligibility?: EligibilityCriteria;
  eligibility_text?: string;
  source_url?: string;
  claim_url?: string;
  /**
   * The source's claim status. Adapters that cannot tell leave it undefined,
   * which counts as open for new rows and never changes an existing row.
   */
  status?: FeedStatus;
}

export type FilingJobStatus = 'queued' | 'needs_user' | 'submitted' | 'confirmed' | 'failed';

export type FilingMethod = 'manual' | 'browser' | 'api';

export type MatchEventType =
  | 'impression'
  | 'view'
  | 'save'
  | 'dismiss'
  | 'open_form'
  | 'filed'
  | 'user_reported_payout';

export type MatchLabelKind = 'not_relevant' | 'filed' | 'paid';

export type EligibilityDraftStatus = 'pending' | 'approved' | 'rejected';

export interface ClaimAuthorization {
  id: string;
  claim_id: string;
  user_id: string;
  lawsuit_id: string;
  text_version: string;
  full_text: string;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface FilingJob {
  id: string;
  claim_id: string;
  user_id: string;
  lawsuit_id: string;
  authorization_id: string | null;
  status: FilingJobStatus;
  needs_user_reason: string | null;
  administrator_claim_id: string | null;
  screenshot_url: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  run_after: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Administrator {
  id: string;
  slug: string;
  name: string;
  filing_method: FilingMethod;
  homepage_url: string | null;
  notes: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdministratorFormMapping {
  id: string;
  administrator_id: string;
  lawsuit_id: string | null;
  mapping: FormFieldMapping;
  created_at: string;
  updated_at: string;
}

/** Official-form field mapping used by the browser worker. */
export interface FormFieldMapping {
  claimUrl?: string;
  submitSelector?: string;
  fields?: Array<{
    profileKey: string;
    selector: string;
    type?: 'text' | 'select' | 'checkbox';
  }>;
}

export interface MatchEvent {
  id: string;
  user_id: string;
  lawsuit_id: string;
  match_id: string | null;
  event_type: MatchEventType;
  score: number | null;
  rank: number | null;
  matched_signals: string[];
  model_version: string;
  payout_amount: number | null;
  created_at: string;
}

export interface MatchFeatureSnapshot {
  id: string;
  user_id: string;
  lawsuit_id: string;
  match_event_id: string | null;
  attribute_overlap: string[];
  state: string | null;
  category: string | null;
  deadline_days: number | null;
  proof_required: string | null;
  payout_size: number | null;
  model_version: string;
  created_at: string;
}

export interface MatchLabel {
  id: string;
  user_id: string;
  lawsuit_id: string;
  label: MatchLabelKind;
  payout_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EligibilityRuleDraft {
  id: string;
  lawsuit_id: string;
  eligibility: EligibilityCriteria;
  eligibility_text: string | null;
  source_excerpt: string | null;
  rationale: Record<string, unknown>;
  status: EligibilityDraftStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface IngestAlert {
  id: string;
  job: string;
  reason: 'failed' | 'zero_updates';
  error: string | null;
  summary: Record<string, unknown>;
  emailed_at: string | null;
  created_at: string;
}

export const LAWSUIT_CATEGORIES = [
  'Data Breach',
  'Consumer Products',
  'Auto & Vehicles',
  'Privacy',
  'Financial & Banking',
  'Health & Pharma',
  'Employment',
  'Food & Beverage',
  'Technology',
  'General',
] as const;
