/**
 * Server only: what a public page may say about who files, for its viewer
 * (issue #53). Asks the one gate (./one-click-access.ts), so:
 *   - one-click not on for this viewer (and no fee disclosure): the page's
 *     unchanged "Lawsuit AI never files for you" text;
 *   - one-click on for this viewer and the settlement has an agent lane the
 *     law firm enabled: the per-settlement one-click text;
 *   - otherwise (no agent lane, or it cannot be read): self-file text that
 *     makes no "never files" promise.
 * A statically rendered page has no viewer (null): in test mode it shows the
 * unchanged text to everyone; once ONE_CLICK_FILING_ENABLED is on, the
 * one-click text. Never import this from a client component.
 */
import type { SettlementFilingMode } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { oneClickEnabledFor, oneClickMayBeOn, type OneClickViewer } from './one-click-access';
import { loadSettlementEnvs } from './v2/environment';
import { previewLaneFor } from './v2/view';

/** Lawsuit AI may file some claims for this viewer: the fee disclosure says so, or one-click is on for them. */
export function viewerMayFile(viewer: OneClickViewer | null): boolean {
  return flags.feeDisclosure() || oneClickEnabledFor(viewer);
}

/**
 * The settlement page's mode for this viewer. `memberState` is the signed-in
 * member's state; without one (a static page) the lane is checked for a state
 * the settlement's policy covers, so "agent" means Lawsuit AI files claims
 * for this settlement for some members. Any doubt is self_file.
 */
export async function settlementFilingMode(args: {
  lawsuitId: string;
  viewer: OneClickViewer | null;
  memberState?: string | null;
  now?: Date;
}): Promise<SettlementFilingMode> {
  if (!viewerMayFile(args.viewer)) return 'never_files';
  if (!oneClickMayBeOn() || !oneClickEnabledFor(args.viewer)) return 'self_file';
  const now = args.now ?? new Date();
  try {
    const batch = await loadSettlementEnvs([args.lawsuitId], now);
    const env = batch.ok ? batch.envs.get(args.lawsuitId) : undefined;
    if (!batch.ok || !env) return 'self_file';
    const state = args.memberState ?? env.policy.allowed_states?.[0] ?? null;
    return previewLaneFor(env, batch.lane, state, now).agent ? 'agent' : 'self_file';
  } catch {
    return 'self_file';
  }
}
