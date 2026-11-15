/**
 * Props the server passes to the one-click filing UI (claim page and
 * dashboard). Types only, so client components can import them without
 * pulling in server code. Shapes come from the member API contract
 * (src/lib/filing/v2/contract.ts).
 */
import type { ClaimFilingSummary, ClaimFilingView, LaneView } from '@/lib/filing/v2/contract';

/**
 * The claim page's one-click data. Null (not this object) when
 * ONE_CLICK_FILING_ENABLED is off, so ClaimFlow renders exactly as before.
 */
export interface OneClickClaimProps {
  /** The member's filing view of this claim; null without a claim or when it could not be read. */
  view: ClaimFilingView | null;
  /** The lane this member gets today: from the view, or the preview when there is no claim yet. */
  lane: LaneView | null;
  /**
   * Offer "Lawsuit AI files this claim for you": a strong match (never a
   * possible or state-only one) on an agent lane, open for claims, and no
   * one-click claim under way yet.
   */
  canStart: boolean;
  /** The claim is in a one-click status but its view could not be read. */
  loadFailed: boolean;
  /** The account's sign-in email, for signing in again before "File my claim". */
  accountEmail: string | null;
}

/** The dashboard's one-click data; null when the flag is off. */
export interface OneClickDashboardData {
  /** Null when the list could not be read. */
  summaries: ClaimFilingSummary[] | null;
  /** Lanes of strong matches, by settlement id (possible matches are never looked up). */
  lanes: Readonly<Record<string, LaneView>>;
}
