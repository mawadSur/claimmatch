import { canManageStaffRoles, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { dbFail, fail, guard, reply, routeId } from '../../_lib/http';
import { roleView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DELETE /api/admin/filing/roles/{roleId} (admin or legal_reviewer): revoke a role, once (the row is kept). */
export async function DELETE(req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const auth = await guard(req, canManageStaffRoles);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'roleId');
  if (!id.ok) return id.res;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('staff_roles')
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.staff.id })
    .eq('id', id.id)
    .is('revoked_at', null)
    .select('id, user_id, role, granted_by, granted_at')
    .maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail('not_found');
  await recordStaffAccess({
    staff: auth.staff,
    action: 'revoke_role',
    subjectUserId: String(data.user_id),
    targetTable: 'staff_roles',
    targetId: id.id,
    detail: { role: data.role },
    req,
  });
  return reply({ role: roleView(data as Record<string, unknown>, null) });
}
