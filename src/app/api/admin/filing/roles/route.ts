import { GrantRoleRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canGrantStaffRole, canManageStaffRoles, canOpenFilingConsole, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { dbFail, fail, guard, readBody, reply } from '../_lib/http';
import { likePattern } from '../_lib/settlements';
import { roleView } from '../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

/** GET /api/admin/filing/roles (admin or legal_reviewer): the active staff roles. */
export async function GET(req: Request) {
  const auth = await guard(req, canManageStaffRoles);
  if (!auth.ok) return auth.res;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('staff_roles')
    .select('id, user_id, role, granted_by, granted_at')
    .is('revoked_at', null)
    .order('granted_at', { ascending: true });
  if (error) return fail('service_unavailable');
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  const { data: profiles } = ids.length ? await svc.from('profiles').select('id, email').in('id', ids) : { data: [] as Row[] };
  const emailOf = new Map(((profiles ?? []) as Row[]).map((p) => [String(p.id), typeof p.email === 'string' ? p.email : null]));
  return reply({ roles: rows.map((r) => roleView(r, emailOf.get(String(r.user_id)) ?? null)) });
}

/**
 * POST /api/admin/filing/roles: grant a role by the person's account email.
 * legal_reviewer only by a legal_reviewer (0038 checks it again); filing_agent
 * by an admin or a legal_reviewer. Nobody grants themself; granted_by is the caller.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, GrantRoleRequestSchema);
  if (!body.ok) return body.res;
  if (!canGrantStaffRole(auth.staff, body.data.role)) return fail('role_required');
  const svc = createServiceClient();
  const { data: people } = await svc.from('profiles').select('id, email').ilike('email', likePattern(body.data.email).slice(1, -1)).limit(2);
  const matches = ((people ?? []) as Row[]).filter((p) => String(p.email).toLowerCase() === body.data.email.toLowerCase());
  if (matches.length !== 1) return fail('not_found');
  const userId = String(matches[0].id);
  if (userId === auth.staff.id) return fail('forbidden');
  const { data: existing } = await svc
    .from('staff_roles')
    .select('id, user_id, role, granted_by, granted_at')
    .eq('user_id', userId)
    .eq('role', body.data.role)
    .is('revoked_at', null)
    .maybeSingle();
  if (existing) return reply({ role: roleView(existing as Row, String(matches[0].email)) });
  const { data, error } = await svc
    .from('staff_roles')
    .insert({ user_id: userId, role: body.data.role, granted_by: auth.staff.id, notes: body.data.notes })
    .select('id, user_id, role, granted_by, granted_at')
    .single();
  if (error || !data) return dbFail(error, { '23514': 'forbidden', '23505': 'invalid_transition' });
  await recordStaffAccess({
    staff: auth.staff,
    action: 'grant_role',
    subjectUserId: userId,
    targetTable: 'staff_roles',
    targetId: String(data.id),
    detail: { role: body.data.role },
    req,
  });
  return reply({ role: roleView(data as Row, String(matches[0].email)) }, 201);
}
