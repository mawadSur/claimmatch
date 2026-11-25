import type { Claim, Match, Profile, ProfileFact } from '@/lib/types';
import { PRIVACY_POLICY_VERSION } from '@/lib/consent';
import type { OneClickExport } from '@/lib/account-export-filing';

export interface AccountExportConsent {
  category: string;
  granted_at: string;
  policy_version: string;
}

export interface AccountExportPayload {
  exported_at: string;
  policy_version: string;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    state: string | null;
    phone: string | null;
    attributes: Record<string, unknown>;
    email_opt_in: boolean;
    email_frequency: 'instant' | 'weekly' | null;
    onboarded: boolean;
    created_at: string;
  };
  profile_facts: Array<{
    type: string;
    value: string;
    start_date: string | null;
    end_date: string | null;
    source: string | null;
    created_at?: string;
  }>;
  consent: AccountExportConsent[];
  matches: Array<{
    score: number;
    reasons: string[];
    dismissed: boolean;
    notified_at: string | null;
    lawsuit_title?: string | null;
    lawsuit_slug?: string | null;
  }>;
  claims: Array<{
    id: string;
    lawsuit_title?: string | null;
    status: string;
  }>;
  /** One-click filing records, member-safe fields only (src/lib/account-export-filing.ts). */
  one_click_filing: OneClickExport;
  /** Shared claim profile extras (0051). Never SSN, bank numbers, or PINs. */
  claim_profile: {
    legal_name: string | null;
    aliases: string | null;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    payout_preference: string | null;
    vehicle_vin: string | null;
    account_emails: string[];
    addresses: Array<{
      kind: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      zip: string;
      lived_from: string | null;
      lived_to: string | null;
    }>;
    consent_at: string | null;
  } | null;
  /** Self-filed reports (0049). Screenshot metadata only — never a storage path. */
  self_filed_reports: Array<{
    lawsuit_title: string | null;
    lawsuit_slug: string | null;
    confirmation_number: string | null;
    has_screenshot: boolean;
    screenshot_mime: string | null;
    screenshot_bytes: number | null;
    created_at: string;
  }>;
}

const EMPTY_ONE_CLICK: OneClickExport = {
  packets: [],
  documents: [],
  signatures: [],
  signature_voids: [],
  esign_consents: [],
  filing_jobs: [],
};

export function buildAccountExport(input: {
  now?: Date;
  profile: Profile;
  facts: ProfileFact[];
  consent: AccountExportConsent[];
  matches: Array<
    Pick<Match, 'score' | 'reasons' | 'dismissed' | 'notified_at'> & {
      lawsuit?: { title?: string | null; slug?: string | null } | null;
    }
  >;
  claims: Array<Pick<Claim, 'id' | 'status'> & { lawsuit_title?: string | null }>;
  oneClick?: OneClickExport;
  claimProfile?: AccountExportPayload['claim_profile'];
  selfFiledReports?: Array<{
    lawsuit_title?: string | null;
    lawsuit_slug?: string | null;
    confirmation_number?: string | null;
    confirmation_storage_path?: string | null;
    confirmation_mime?: string | null;
    confirmation_bytes?: number | null;
    created_at: string;
  }>;
}): AccountExportPayload {
  const profile = input.profile;
  return {
    exported_at: (input.now ?? new Date()).toISOString(),
    policy_version: PRIVACY_POLICY_VERSION,
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      state: profile.state,
      phone: profile.phone,
      attributes: profile.attributes ?? {},
      email_opt_in: profile.email_opt_in,
      email_frequency: profile.email_frequency ?? null,
      onboarded: profile.onboarded,
      created_at: profile.created_at,
    },
    profile_facts: input.facts.map((fact) => ({
      type: fact.type,
      value: fact.value,
      start_date: fact.start_date ?? null,
      end_date: fact.end_date ?? null,
      source: fact.source ?? null,
      created_at: fact.created_at,
    })),
    consent: input.consent,
    matches: input.matches.map((match) => ({
      score: match.score,
      reasons: match.reasons ?? [],
      dismissed: match.dismissed,
      notified_at: match.notified_at,
      lawsuit_title: match.lawsuit?.title ?? null,
      lawsuit_slug: match.lawsuit?.slug ?? null,
    })),
    claims: input.claims.map((claim) => ({
      id: claim.id,
      lawsuit_title: claim.lawsuit_title ?? null,
      status: claim.status,
    })),
    one_click_filing: input.oneClick ?? EMPTY_ONE_CLICK,
    claim_profile: input.claimProfile ?? null,
    self_filed_reports: (input.selfFiledReports ?? []).map((row) => ({
      lawsuit_title: row.lawsuit_title ?? null,
      lawsuit_slug: row.lawsuit_slug ?? null,
      confirmation_number: row.confirmation_number ?? null,
      has_screenshot: Boolean(row.confirmation_storage_path && row.confirmation_storage_path.trim()),
      screenshot_mime: row.confirmation_mime ?? null,
      screenshot_bytes: row.confirmation_bytes ?? null,
      created_at: row.created_at,
    })),
  };
}
