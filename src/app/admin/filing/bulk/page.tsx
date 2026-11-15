import type { Metadata } from 'next';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { BulkConsole } from '@/components/admin/filing/BulkConsole';
import { TestModeBanner } from '@/components/admin/filing/TestModeBanner';
import { requireOneClickStaff } from '../_lib/gate';
import { filingPermissions } from '../_lib/permissions';

export const metadata: Metadata = { title: 'Bulk exports' };
export const dynamic = 'force-dynamic';

/** /admin/filing/bulk: export administrator_bulk claims, then record each claim's result. ?lawsuit=<id> preselects one. */
export default async function FilingBulkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireOneClickStaff('/admin/filing/bulk');
  const { lawsuit } = await searchParams;
  const lawsuitId = typeof lawsuit === 'string' && UuidSchema.safeParse(lawsuit).success ? lawsuit : null;
  return (
    <>
      <TestModeBanner />
      <BulkConsole permissions={filingPermissions(staff)} lawsuitId={lawsuitId} />
    </>
  );
}
