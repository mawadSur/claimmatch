import { notFound } from 'next/navigation';
import { oneClickEnabledFor, oneClickMayBeOn } from '@/lib/filing/one-click-access';
import { requireStaff, type StaffUser } from '@/lib/staff-roles';

/**
 * Every one-click /admin/filing page: 404 while one-click is off for everyone
 * (before any sign-in read), then the staff check (redirects), then the
 * one-click gate for staff (src/lib/filing/one-click-access.ts).
 */
export async function requireOneClickStaff(path: string): Promise<StaffUser> {
  if (!oneClickMayBeOn()) notFound();
  const staff = await requireStaff(path);
  if (!oneClickEnabledFor({ kind: 'staff', isStaff: true })) notFound();
  return staff;
}
