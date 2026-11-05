/**
 * The JSON contract between /api/mobile/* and the native app. Types and one
 * constant only, with type-only relative imports, so the app can import this
 * file ('@/' points at the app's own src there).
 */
import type {
  ClosingSoonItem,
  DashboardMatch,
  DashboardRow,
  NoticeItem,
} from '../components/claims/dashboard-model';
import type { ClaimFlowSettlement, PacketProfile } from './claim-screen';
import type { ClaimView, SettlementContext } from './claims';
import type { ClientFlagName } from './flags';

/** Raised only when a response changes in a way older app builds cannot read. */
export const MOBILE_API_VERSION = 1;

/** GET /api/mobile/config (no sign-in needed). */
export interface ClientConfig {
  apiVersion: typeof MOBILE_API_VERSION;
  /** The server clock (ISO 8601), for correcting a skewed device clock. */
  serverTime: string;
  /** Today (YYYY-MM-DD) in America/New_York, the zone deadlines are counted in. */
  todayDeadlineZone: string;
  flags: Record<ClientFlagName, boolean>;
  /** Served rather than bundled, so counsel can change it without an app release. */
  legal: { disclaimer: string; short: string; contactEmail: string | null };
  /** Builds below these must update before use; 0 means no minimum. */
  minBuild: { ios: number; android: number };
}

/** A dashboard match without its internal score: scores are never shown. */
export type AppMatch = Omit<DashboardMatch, 'score'>;

/** GET /api/mobile/dashboard. A `failed` section shows the web's error copy for it. */
export interface DashboardResponse {
  serverTime: string;
  profile: { firstName: string; onboarded: boolean; needsProfile: boolean };
  claims: { failed: boolean; rows: DashboardRow[]; notices: NoticeItem[] };
  matches: { failed: boolean; strong: AppMatch[]; possible: AppMatch[]; possibleHidden: number };
  closingSoon: { failed: boolean; items: ClosingSoonItem[] };
  /**
   * Claims still to file whose deadline has not passed. Empty when
   * claims.failed, so keep the reminders already scheduled in that case.
   */
  reminders: { claimId: string; slug: string; title: string; deadline: string }[];
}

/** GET /api/mobile/claim/[slug], status 200. */
export type ClaimScreenResponse =
  | {
      kind: 'closed';
      slug: string;
      title: string;
      category: string | null;
      deadline: string | null;
      deadlinePassed: boolean;
      officialUrl: string | null;
    }
  | {
      kind: 'flow';
      /** The server time `context` was computed at (ISO 8601). */
      now: string;
      slug: string;
      title: string;
      category: string | null;
      settlement: ClaimFlowSettlement;
      context: SettlementContext;
      claim: ClaimView | null;
      profile: PacketProfile | null;
    };

/** GET /api/mobile/claim/[slug], status 404 (not_found) or 503 (load_error). */
export type ClaimScreenError =
  | { code: 'not_found' }
  | { code: 'load_error'; what: 'this settlement' | 'your claim' };
