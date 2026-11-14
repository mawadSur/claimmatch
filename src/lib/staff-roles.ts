import { redirect } from 'next/navigation';
import { adminDeniedPath, getAdminUser } from '@/lib/admin';
import { STAFF_ROLES, type StaffAuditAction, type StaffRole } from '@/lib/filing/v2/contract-staff';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * Server only. Staff roles for one-click filing (CONTRACT; implemented here,
 * read-only for builders), following src/lib/admin.ts:
 *   legal_reviewer  the law firm on retainer: the only role that approves a
 *                   filing spec or policy, turns a kill switch off or clears
 *                   an objection (0038 checks it again in the database);
 *   filing_agent    desk staff who submit signed claims on the official site,
 *                   in their own browser, and record the result.
 * Roles live in public.staff_roles (0037), which no API role can read, so
 * they are read with the service role. There is no environment bootstrap:
 * the founder adds the first legal_reviewer with one SQL insert (granted_by
 * null); after that only a legal_reviewer adds a legal_reviewer (0038
 * enforces it; nobody grants themself), and an admin or a legal_reviewer adds
 * filing agents. Admin (profiles.is_admin or ADMIN_EMAILS) opens the console
 * and drafts, but never implies a role. Staff routes use the web cookie
 * session only.
 */

export { STAFF_ROLES };
export type { StaffRole };

export interface StaffUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
  roles: StaffRole[];
}

export type StaffCheck = (user: StaffUser) => boolean;

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Active roles of a user. [] on any error, so a failure never grants access. */
export async function loadStaffRoles(userId: string): Promise<StaffRole[]> {
  try {
    const { data, error } = await createServiceClient()
      .from('staff_roles')
      .select('role')
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error || !Array.isArray(data)) return [];
    const roles = (data as Array<{ role: unknown }>).map((row) => row.role).filter(isStaffRole);
    return [...new Set(roles)].sort();
  } catch {
    return [];
  }
}

async function resolveStaff(): Promise<{ signedIn: boolean; staff: StaffUser | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { signedIn: false, staff: null };
    const [admin, roles] = await Promise.all([getAdminUser(), loadStaffRoles(user.id)]);
    const isAdmin = admin?.id === user.id;
    if (!isAdmin && roles.length === 0) return { signedIn: true, staff: null };
    return { signedIn: true, staff: { id: user.id, email: user.email ?? null, isAdmin, roles } };
  } catch {
    return { signedIn: false, staff: null };
  }
}

/** The signed-in user as staff, or null when signed out or neither admin nor holding a role. */
export async function getStaffUser(): Promise<StaffUser | null> {
  return (await resolveStaff()).staff;
}

export function hasStaffRole(user: StaffUser | null | undefined, role: StaffRole): boolean {
  return Boolean(user?.roles.includes(role));
}

/** Open /admin/filing (lists without personal data). */
export const canOpenFilingConsole: StaffCheck = (user) => user.isAdmin || user.roles.length > 0;
/** Draft policies and specs ("staff/admins draft"). */
export const canDraftFilingConfig: StaffCheck = (user) => user.isAdmin || user.roles.length > 0;
/** Approve or reject a policy or spec version, retire a spec: the law firm only. */
export const canApproveFilingConfig: StaffCheck = (user) => hasStaffRole(user, 'legal_reviewer');
/** Take desk jobs, record results, export and record bulk batches. */
export const canWorkFilingDesk: StaffCheck = (user) => hasStaffRole(user, 'filing_agent');
/** See a member's signed packet and documents (always audit-logged). */
export const canViewMemberFilingData: StaffCheck = (user) =>
  hasStaffRole(user, 'filing_agent') || hasStaffRole(user, 'legal_reviewer');
/** Resolve a needs_attention job. */
export const canResolveFilingJobs: StaffCheck = canViewMemberFilingData;
/** List and revoke staff roles (revoking only ever removes access). */
export const canManageStaffRoles: StaffCheck = (user) => user.isAdmin || hasStaffRole(user, 'legal_reviewer');
/** Grant a role: legal_reviewer only by a legal_reviewer (the law firm adds its own people); filing_agent by an admin or a legal_reviewer. */
export function canGrantStaffRole(user: StaffUser, role: StaffRole): boolean {
  return role === 'legal_reviewer' ? hasStaffRole(user, 'legal_reviewer') : canManageStaffRoles(user);
}
/** Read the staff access log. */
export const canReadFilingAudit: StaffCheck = (user) => user.isAdmin || hasStaffRole(user, 'legal_reviewer');

/** A kill switch goes on from anyone in the console, and off only by a legal_reviewer. */
export function canSetKillSwitch(user: StaffUser, active: boolean): boolean {
  return active ? canOpenFilingConsole(user) : canApproveFilingConfig(user);
}

/** An objection is recorded by anyone in the console, and cleared only by a legal_reviewer. */
export function canSetObjection(user: StaffUser, clearing: boolean): boolean {
  return clearing ? canApproveFilingConfig(user) : canOpenFilingConsole(user);
}

/** claim_filing_jobs.lock_owner for a desk job taken by this staff member. */
export function staffLockOwner(user: Pick<StaffUser, 'id'>): string {
  return `staff:${user.id}`;
}

/**
 * Server guard for /admin/filing pages. Returns the staff user, or redirects:
 * signed-out visitors to log in (and back), signed-in users without access to
 * the dashboard with an access-denied message.
 */
export async function requireStaff(path: string, check: StaffCheck = canOpenFilingConsole): Promise<StaffUser> {
  const { signedIn, staff } = await resolveStaff();
  if (staff && check(staff)) return staff;
  return redirect(adminDeniedPath(signedIn, path));
}

export type StaffRequestAuth = { ok: true; staff: StaffUser } | { ok: false; status: 401 | 403 };

/** API guard: 401 when signed out, 403 when signed in without the access `check` needs. */
export async function staffForRequest(check: StaffCheck = canOpenFilingConsole): Promise<StaffRequestAuth> {
  const { signedIn, staff } = await resolveStaff();
  if (!signedIn) return { ok: false, status: 401 };
  if (!staff || !check(staff)) return { ok: false, status: 403 };
  return { ok: true, staff };
}

export interface StaffAccessEntry {
  staff: StaffUser;
  action: StaffAuditAction;
  subjectUserId?: string | null;
  claimId?: string | null;
  jobId?: string | null;
  lawsuitId?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  /** Ids, codes and counts only: never a member's name, address or answers. */
  detail?: Record<string, unknown>;
  req?: Request;
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/** Plain IPv6 that Postgres inet accepts: 8 groups, or fewer with exactly one "::". */
function isIpv6ForInet(value: string): boolean {
  if (value.length < 2 || value.length > 39 || !/^[0-9a-f:]+$/i.test(value)) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === '' ? [] : half.split(':')));
  if (groups.some((g) => g.length < 1 || g.length > 4)) return false;
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

/** The caller's IP for an inet column: the first X-Forwarded-For entry, only when Postgres would accept it. */
export function requestIpForRecord(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]?.trim() ?? '';
  return IPV4.test(first) || isIpv6ForInet(first) ? first : null;
}

/**
 * Writes one filing_audit_log row (append-only). Never throws. Returns false
 * when the row could not be written: callers about to show a member's
 * personal data must then not show it (fail closed).
 */
export async function recordStaffAccess(entry: StaffAccessEntry): Promise<boolean> {
  try {
    const userAgent = entry.req?.headers.get('user-agent')?.trim().slice(0, 512) || null;
    const { error } = await createServiceClient()
      .from('filing_audit_log')
      .insert({
        actor_id: entry.staff.id,
        actor_roles: [...(entry.staff.isAdmin ? ['admin'] : []), ...entry.staff.roles],
        action: entry.action,
        subject_user_id: entry.subjectUserId ?? null,
        claim_id: entry.claimId ?? null,
        job_id: entry.jobId ?? null,
        lawsuit_id: entry.lawsuitId ?? null,
        target_table: entry.targetTable ?? null,
        target_id: entry.targetId ?? null,
        detail: entry.detail ?? {},
        ip: entry.req ? requestIpForRecord(entry.req) : null,
        user_agent: userAgent,
      });
    if (error) {
      console.error('[staff-audit] write failed', { action: entry.action, code: error.code });
      return false;
    }
    return true;
  } catch {
    console.error('[staff-audit] write failed', { action: entry.action });
    return false;
  }
}
