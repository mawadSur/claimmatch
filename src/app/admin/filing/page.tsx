import type { Metadata } from 'next';
import { oneClickMayBeOn } from '@/lib/filing/one-click-access';
import { FilingOverview } from '@/components/admin/filing/FilingOverview';
import { TestModeBanner } from '@/components/admin/filing/TestModeBanner';
import { requireOneClickStaff } from './_lib/gate';
import { filingPermissions } from './_lib/permissions';
import { LegacyAssistedFilingPage } from './_lib/legacy-page';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: oneClickMayBeOn() ? 'Filing console' : 'Assisted filing' };
}

/**
 * /admin/filing. One-click off (ONE_CLICK_FILING_ENABLED and test mode off):
 * the legacy assisted-filing page, exactly as before. On (or test mode): the
 * one-click filing console (admins and staff with a filing role; lists hold
 * no personal data).
 */
export default async function AdminFilingPage() {
  if (!oneClickMayBeOn()) return LegacyAssistedFilingPage();
  const staff = await requireOneClickStaff('/admin/filing');
  return (
    <>
      <TestModeBanner />
      <FilingOverview permissions={filingPermissions(staff)} />
    </>
  );
}
