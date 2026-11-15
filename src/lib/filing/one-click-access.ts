/**
 * Who gets one-click filing. Every gate (member pages and API, the staff
 * console and API, the app's config, the cron) asks this module, never the
 * flags directly:
 *
 *   ONE_CLICK_FILING_ENABLED=1                 live: everyone (today's "on")
 *   ONE_CLICK_FILING_TEST_MODE=1 (and not ^)   test: INTERNAL_EMAILS testers,
 *                                              filing staff and the cron only
 *   neither                                    off: nobody (today's "off")
 *
 * Both on is live: test mode changes nothing once one-click is on for all.
 * In test mode the cron runs, but every outbound filing side effect is
 * sandboxed (src/lib/filing/channels/test-mode.ts) and every new job is a
 * test job (claim_filing_jobs.is_test, 0046).
 */
import { flags } from '@/lib/flags';
import { isInternalEmail } from '@/lib/internal-users';

export type OneClickMode = 'off' | 'test' | 'live';

export function oneClickMode(): OneClickMode {
  if (flags.oneClickFiling()) return 'live';
  return flags.oneClickFilingTestMode() ? 'test' : 'off';
}

/** True only in test mode (test mode on, ONE_CLICK_FILING_ENABLED off). */
export function oneClickTestMode(): boolean {
  return oneClickMode() === 'test';
}

/**
 * The cheap first check, before any sign-in or database read: false means
 * one-click is off for everyone, so a route answers 404 exactly as before.
 * True means it may be on for this caller: ask oneClickEnabledFor next.
 */
export function oneClickMayBeOn(): boolean {
  return oneClickMode() !== 'off';
}

export type OneClickViewer =
  /** A signed-in member (web or app). */
  | { kind: 'member'; email: string | null | undefined }
  /** The staff console: true when the caller is an admin or holds a filing role. */
  | { kind: 'staff'; isStaff: boolean }
  /** The filing cron (sandboxed in test mode). */
  | { kind: 'system' };

/** The one gate. null is a signed-out visitor. */
export function oneClickEnabledFor(viewer: OneClickViewer | null): boolean {
  const mode = oneClickMode();
  if (mode === 'live') return true;
  if (mode === 'off' || !viewer) return false;
  switch (viewer.kind) {
    case 'system':
      return true;
    case 'staff':
      return viewer.isStaff === true;
    case 'member':
      return isInternalEmail(viewer.email);
    default:
      return false;
  }
}
