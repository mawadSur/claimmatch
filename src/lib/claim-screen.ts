/**
 * Data shapes for the claim screen (/claim/[slug]), shared by the web page,
 * its server loader (claim-screen-server.ts) and the native app. Pure (no
 * Supabase, no React), so the app can import it.
 */
import {
  eligibilitySummary,
  linkHost,
  proofNeed,
  safeExternalUrl,
  type ProofNeed,
} from './claims';
import { officialSiteUrl } from './lawsuit-display';
import type { Profile } from './types';

export interface ClaimFlowSettlement {
  id: string;
  slug: string;
  title: string;
  deadline: string | null;
  /** The official claim site (claim_url), when we have a real link; never a settlesignal.com listing. */
  officialUrl: string | null;
  /** Where the listing came from (not an official site). */
  sourceUrl: string | null;
  sourceHost: string | null;
  /** The listing's eligibility text, or null when it is only a placeholder. */
  eligibility: string | null;
  proof: ProofNeed;
  /** C10: official-form field order when stored. */
  formFieldOrder?: string[] | null;
  /** Full-service filing is on (ASSISTED_FILING_ENABLED=1). */
  assistedFilingAllowed?: boolean;
  /** C4: show "I got paid" amount form when the claim is already submitted. */
  payoutReportEnabled?: boolean;
}

/** The settlement columns the claim flow reads (a claims-server SettlementRecord). */
interface ClaimFlowSettlementRow {
  id: string;
  slug: string;
  title: string;
  deadline: string | null;
  claim_url: string | null;
  source_url: string | null;
  eligibility_text: string | null;
  proof_required?: boolean | null;
  eligibility?: unknown;
  form_field_order?: string[] | null;
}

/**
 * The settlement as the claim flow shows it. The caller passes the flag
 * values: flags are server environment variables, so they read as off
 * anywhere else.
 */
export function toClaimFlowSettlement(
  row: ClaimFlowSettlementRow,
  opts: { assistedFilingAllowed: boolean; payoutReportEnabled: boolean },
): ClaimFlowSettlement {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    deadline: row.deadline,
    officialUrl: officialSiteUrl(row.claim_url),
    sourceUrl: safeExternalUrl(row.source_url),
    sourceHost: linkHost(row.source_url),
    eligibility: eligibilitySummary(row.eligibility_text),
    proof: proofNeed(row),
    formFieldOrder: row.form_field_order ?? null,
    assistedFilingAllowed: opts.assistedFilingAllowed,
    payoutReportEnabled: opts.payoutReportEnabled,
  };
}

/**
 * The profile columns the copy-ready details (PrefillPacket) read. Selecting
 * only these keeps matching answers and account flags out of the claim
 * screen's payload.
 */
export const PACKET_PROFILE_COLUMNS =
  'full_name, email, phone, address_line1, address_line2, city, state, prefill_consent_at';

export type PacketProfile = Pick<
  Profile,
  'full_name' | 'email' | 'phone' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'prefill_consent_at'
>;
