import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { flags } from '@/lib/flags';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { requireStaff } from '@/lib/staff-roles';
import { BulkConsole } from '@/components/admin/filing/BulkConsole';
import { filingPermissions } from '../_lib/permissions';

export const metadata: Metadata = { title: 'Bulk exports' };
export const dynamic = 'force-dynamic';

/** /admin/filing/bulk: export administrator_bulk claims, then record each claim's result. ?lawsuit=<id> preselects one. */
export default async function FilingBulkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!flags.oneClickFiling()) notFound();
  const staff = await requireStaff('/admin/filing/bulk');
  const { lawsuit } = await searchParams;
  const lawsuitId = typeof lawsuit === 'string' && UuidSchema.safeParse(lawsuit).success ? lawsuit : null;
  return <BulkConsole permissions={filingPermissions(staff)} lawsuitId={lawsuitId} />;
}
