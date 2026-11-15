import type { Metadata } from 'next';
import { flags } from '@/lib/flags';
import { requireStaff } from '@/lib/staff-roles';
import { FilingOverview } from '@/components/admin/filing/FilingOverview';
import { filingPermissions } from './_lib/permissions';
import { LegacyAssistedFilingPage } from './_lib/legacy-page';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: flags.oneClickFiling() ? 'Filing console' : 'Assisted filing' };
}

/**
 * /admin/filing. ONE_CLICK_FILING_ENABLED off: the legacy assisted-filing
 * page, exactly as before. On: the one-click filing console (admins and staff
 * with a filing role; lists hold no personal data).
 */
export default async function AdminFilingPage() {
  if (!flags.oneClickFiling()) return LegacyAssistedFilingPage();
  const staff = await requireStaff('/admin/filing');
  return <FilingOverview permissions={filingPermissions(staff)} />;
}
