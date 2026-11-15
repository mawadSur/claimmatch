import {
  canApproveFilingConfig,
  canDraftFilingConfig,
  canManageStaffRoles,
  canResolveFilingJobs,
  canSetKillSwitch,
  canSetObjection,
  canViewMemberFilingData,
  canWorkFilingDesk,
  type StaffUser,
} from '@/lib/staff-roles';
import type { FilingPermissions } from '@/components/admin/filing/types';

/**
 * Server only. What the console shows this staff member, from the checks in
 * src/lib/staff-roles.ts (the single source of truth). The client components
 * only hide or show controls; every staff API checks the role again.
 */
export function filingPermissions(staff: StaffUser): FilingPermissions {
  return {
    userId: staff.id,
    isAdmin: staff.isAdmin,
    roles: [...staff.roles],
    canDraft: canDraftFilingConfig(staff),
    canApprove: canApproveFilingConfig(staff),
    canWorkDesk: canWorkFilingDesk(staff),
    canViewMemberData: canViewMemberFilingData(staff),
    canResolveJobs: canResolveFilingJobs(staff),
    canManageRoles: canManageStaffRoles(staff),
    canKillSwitchOn: canSetKillSwitch(staff, true),
    canKillSwitchOff: canSetKillSwitch(staff, false),
    canRecordObjection: canSetObjection(staff, false),
    canClearObjection: canSetObjection(staff, true),
  };
}
