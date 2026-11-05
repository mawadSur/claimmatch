/** The dashboard's API types (GET /api/mobile/dashboard, plan S5), in one place for the feature. */
export type { AppMatch, DashboardResponse } from '@shared/lib/mobile-contract';
export type { ClosingSoonItem, DashboardRow, NoticeItem } from '@shared/components/claims/dashboard-model';

/**
 * Search parameters the dashboard reads, as on the web (?welcome=1,
 * ?password=updated, ?denied=admin). A repeated parameter arrives as an array.
 */
export type DashboardParams = {
  welcome?: string | string[];
  password?: string | string[];
  denied?: string | string[];
};

/** The dashboard stack's routes, for clearing those parameters on this screen's own route. */
export type DashboardStackParams = {
  index: { welcome?: string; password?: string; denied?: string };
};
