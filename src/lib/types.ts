// ClaimMatch — shared domain types. These mirror the SQL schema in
// supabase/migrations/0001_init.sql and are the single source of truth for
// data shapes across the app. Keep in sync with the DB.

export type ClaimStatus =
  | 'processing'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid';

export type LawsuitStatus = 'open' | 'closing_soon' | 'closed' | 'draft';

/** A single eligibility question shown during onboarding. */
export interface EligibilityQuestion {
  /** stable slug stored as a key in profiles.attributes */
  key: string;
  label: string;
  type: 'boolean' | 'select' | 'multiselect' | 'state' | 'text' | 'date';
  options?: string[];
  help?: string;
}

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
  created_at: string;
  updated_at: string;
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
  receipt_number: number;
  user_id: string;
  lawsuit_id: string;
  lawsuit_title: string;
  status: ClaimStatus;
  form_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** joined lawsuit, when selected with a relation */
  lawsuit?: Lawsuit;
}

export interface Subscriber {
  id: string;
  email: string;
  state: string | null;
  interests: string[];
  confirmed: boolean;
  created_at: string;
}

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
}

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  processing: 'Processing',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Not Eligible',
  paid: 'Paid',
};

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
