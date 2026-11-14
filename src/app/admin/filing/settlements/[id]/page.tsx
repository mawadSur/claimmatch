import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { flags } from '@/lib/flags';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { requireStaff } from '@/lib/staff-roles';
import { SettlementConsole } from '@/components/admin/filing/SettlementConsole';
import { filingPermissions } from '../../_lib/permissions';

export const metadata: Metadata = { title: 'Settlement filing settings' };
export const dynamic = 'force-dynamic';

/** /admin/filing/settlements/[id]: one settlement's controls, policies and filing spec. */
export default async function SettlementFilingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!flags.oneClickFiling()) notFound();
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const staff = await requireStaff(`/admin/filing/settlements/${id}`);
  return <SettlementConsole lawsuitId={id} permissions={filingPermissions(staff)} />;
}
