import { GROUP_ORDER } from '@shared/components/claims/dashboard-model';
import type { ClaimGroup } from '@shared/lib/claims';

import { space } from '@/theme/tokens';

import type { DashboardResponse, DashboardRow } from './types';

/**
 * The dashboard as list items, in the web's order
 * (src/app/dashboard/page.tsx): header, banners, welcome, corrective notice,
 * "Finish your profile", Your matches, Your claims (heading, then each
 * group's heading and rows), Closing soon, disclaimer. Every claim row is
 * its own item, so an account with hundreds of claims (the old File-all
 * flow) renders only what is on screen.
 */
export type DashboardItem = { key: string; gap: number } & (
  | { type: 'header' }
  | { type: 'refetchError'; message: string }
  | { type: 'banners'; deniedAdmin: boolean; passwordUpdated: boolean }
  | { type: 'welcome' }
  | { type: 'notices' }
  | { type: 'finishProfile' }
  | { type: 'matches' }
  | { type: 'claimsHeader' }
  | { type: 'claimsFailed' }
  | { type: 'claimsEmpty' }
  | { type: 'group'; group: ClaimGroup; count: number }
  | { type: 'claim'; row: DashboardRow }
  | { type: 'closingSoon' }
  | { type: 'disclaimer' }
);

export interface DashboardItemOptions {
  /** ?welcome=1, after onboarding. */
  welcome: boolean;
  deniedAdmin: boolean;
  passwordUpdated: boolean;
  /** The corrective notice has rows to show (answered ones included). */
  hasNotices: boolean;
  /** A reload failed while older data is on screen. */
  refetchError: string | null;
}

/** Space above each kind of item: sections 32 (the web's space-y-10, tighter on a phone), rows 12. */
const SECTION_GAP = space[8];
const AFTER_SECTION_HEADER = space[6];
const BETWEEN_GROUPS = space[8];
const ROW_GAP = space[3];

/** The claims in GROUP_ORDER, each group with its heading. Empty groups are left out (ClaimList). */
export function groupClaimRows(rows: readonly DashboardRow[]): { group: ClaimGroup; rows: DashboardRow[] }[] {
  return GROUP_ORDER.flatMap((group) => {
    const inGroup = rows.filter((row) => row.group === group);
    return inGroup.length > 0 ? [{ group, rows: inGroup }] : [];
  });
}

export function buildDashboardItems(data: DashboardResponse, options: DashboardItemOptions): DashboardItem[] {
  const items: DashboardItem[] = [];
  const add = (item: DashboardItem) => items.push(items.length === 0 ? { ...item, gap: 0 } : item);

  add({ key: 'header', type: 'header', gap: 0 });
  if (options.refetchError) add({ key: 'refetch-error', type: 'refetchError', message: options.refetchError, gap: space[5] });
  if (options.deniedAdmin || options.passwordUpdated) {
    add({
      key: 'banners',
      type: 'banners',
      deniedAdmin: options.deniedAdmin,
      passwordUpdated: options.passwordUpdated,
      gap: SECTION_GAP,
    });
  }
  if (options.welcome) add({ key: 'welcome', type: 'welcome', gap: SECTION_GAP });
  if (options.hasNotices) add({ key: 'notices', type: 'notices', gap: SECTION_GAP });
  if (!data.profile.onboarded) add({ key: 'finish-profile', type: 'finishProfile', gap: SECTION_GAP });
  add({ key: 'matches', type: 'matches', gap: SECTION_GAP });

  add({ key: 'claims-header', type: 'claimsHeader', gap: SECTION_GAP });
  if (data.claims.failed) {
    add({ key: 'claims-failed', type: 'claimsFailed', gap: AFTER_SECTION_HEADER });
  } else if (data.claims.rows.length === 0) {
    add({ key: 'claims-empty', type: 'claimsEmpty', gap: AFTER_SECTION_HEADER });
  } else {
    groupClaimRows(data.claims.rows).forEach(({ group, rows }, index) => {
      add({
        key: `group-${group}`,
        type: 'group',
        group,
        count: rows.length,
        gap: index === 0 ? AFTER_SECTION_HEADER : BETWEEN_GROUPS,
      });
      for (const row of rows) add({ key: `claim-${row.claimId}`, type: 'claim', row, gap: ROW_GAP });
    });
  }

  add({ key: 'closing-soon', type: 'closingSoon', gap: SECTION_GAP });
  add({ key: 'disclaimer', type: 'disclaimer', gap: SECTION_GAP });
  return items;
}

/** Claim rows rendered in the first batch, after everything above them. */
const FIRST_ROWS = 8;

/**
 * Items to render in the first batch: every section above the claims (the
 * list keeps first-batch items mounted, so they are not rebuilt on the way
 * back up) plus the first few rows. The rest render as they scroll into view.
 * State that must outlive a recycled item (notice answers, the open
 * "Possible matches") is kept by the screen, not by the items.
 */
export function firstBatchSize(items: readonly DashboardItem[]): number {
  const firstRow = items.findIndex((item) => item.type === 'claim');
  const sections = firstRow < 0 ? items.length : firstRow;
  return Math.min(items.length, Math.max(10, sections + FIRST_ROWS));
}
