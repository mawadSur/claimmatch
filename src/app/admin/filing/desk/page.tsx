import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { flags } from '@/lib/flags';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { requireStaff } from '@/lib/staff-roles';
import { DeskConsole } from '@/components/admin/filing/DeskConsole';
import { filingPermissions } from '../_lib/permissions';

export const metadata: Metadata = { title: 'Filing desk' };
export const dynamic = 'force-dynamic';

/**
 * /admin/filing/desk. Filing agents work the queue; admins see it without
 * personal data; legal reviewers may open and resolve jobs. ?job=<id> opens one.
 */
export default async function FilingDeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!flags.oneClickFiling()) notFound();
  const staff = await requireStaff('/admin/filing/desk');
  const { job } = await searchParams;
  const openJobId = typeof job === 'string' && UuidSchema.safeParse(job).success ? job : null;
  return <DeskConsole permissions={filingPermissions(staff)} openJobId={openJobId} />;
}
