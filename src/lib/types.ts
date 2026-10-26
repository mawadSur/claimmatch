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
  created_at: string;
  updated_at: string;
  /** 0004_prefill: when the listing was closed. */
  closed_at?: string | null;
  /** 0004_prefill: last time a human or job verified the official notice. */
  last_verified_at?: string | null;
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
