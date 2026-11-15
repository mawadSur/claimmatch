import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { oneClickMayBeOn } from '@/lib/filing/one-click-access';
import { SettlementConsole } from '@/components/admin/filing/SettlementConsole';
import { TestModeBanner } from '@/components/admin/filing/TestModeBanner';
import { requireOneClickStaff } from '../../_lib/gate';
import { filingPermissions } from '../../_lib/permissions';

export const metadata: Metadata = { title: 'Settlement filing settings' };
export const dynamic = 'force-dynamic';

/** /admin/filing/settlements/[id]: one settlement's controls, policies and filing spec. */
export default async function SettlementFilingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!oneClickMayBeOn()) notFound();
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const staff = await requireOneClickStaff(`/admin/filing/settlements/${id}`);
  return (
    <>
      <TestModeBanner />
      <SettlementConsole lawsuitId={id} permissions={filingPermissions(staff)} />
    </>
  );
}
