/**
 * Types shared by the one-click filing console (/admin/filing/**). Client
 * safe: no server imports. The response types come straight from the staff
 * API contract (src/lib/filing/v2/contract-staff.ts).
 */
import type { z } from 'zod';
import type {
  ControlsViewSchema,
  JobSummarySchema,
  PolicyRecordViewSchema,
  RoleViewSchema,
  SettlementFilingDetailResponseSchema,
  SettlementFilingSummarySchema,
  SettlementListQuerySchema,
  SpecRecordViewSchema,
  StaffRole,
} from '@/lib/filing/v2/contract-staff';

/**
 * What the signed-in staff member may do. Computed on the server from the
 * checks in src/lib/staff-roles.ts (src/app/admin/filing/_lib/permissions.ts)
 * and passed to the client components, which only hide or show controls.
 * Every staff API checks the role again.
 */
export interface FilingPermissions {
  userId: string;
  isAdmin: boolean;
  roles: StaffRole[];
  /** Draft policies and specs (admins and anyone with a role). */
  canDraft: boolean;
  /** Approve or reject a version, retire a spec: legal_reviewer only. */
  canApprove: boolean;
  /** Take desk jobs, record results, bulk export: filing_agent only. */
  canWorkDesk: boolean;
  /** See a member's signed packet and documents (filing_agent, legal_reviewer). */
  canViewMemberData: boolean;
  /** Resolve a needs_attention job (filing_agent, legal_reviewer). */
  canResolveJobs: boolean;
  /** List staff roles, so approvers show by email (admin, legal_reviewer). */
  canManageRoles: boolean;
  canKillSwitchOn: boolean;
  /** legal_reviewer only. */
  canKillSwitchOff: boolean;
  canRecordObjection: boolean;
  /** legal_reviewer only. */
  canClearObjection: boolean;
}

export type SettlementSummary = z.infer<typeof SettlementFilingSummarySchema>;
export type SettlementDetail = z.infer<typeof SettlementFilingDetailResponseSchema>;
export type SettlementFilter = z.output<typeof SettlementListQuerySchema>['filter'];
export type PolicyRecord = z.infer<typeof PolicyRecordViewSchema>;
export type SpecRecord = z.infer<typeof SpecRecordViewSchema>;
export type ControlsView = z.infer<typeof ControlsViewSchema>;
export type JobSummary = z.infer<typeof JobSummarySchema>;
export type RoleView = z.infer<typeof RoleViewSchema>;

/** user id -> email, from GET /api/admin/filing/roles when the viewer may list roles. */
export type ReviewerNames = Readonly<Record<string, string>>;
