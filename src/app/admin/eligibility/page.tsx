import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { listPendingEligibilityDrafts } from '@/lib/eligibility-drafts-store';
import { EligibilityDraftQueue } from '@/components/admin/EligibilityDraftQueue';

export const metadata: Metadata = { title: 'Eligibility drafts' };
export const dynamic = 'force-dynamic';

export default async function AdminEligibilityPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/eligibility');

  if (!flags.eligibilityDrafts()) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-extrabold">Eligibility drafts</h2>
        <p className="max-w-2xl text-sm text-ink-muted">
          This view is off. Set ELIGIBILITY_DRAFTS_ENABLED=1 to review proposed
          structured rules. Drafts never apply until you approve them.
        </p>
      </div>
    );
  }

  const drafts = await listPendingEligibilityDrafts();

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <ListChecks className="h-3.5 w-3.5" /> Pending
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Eligibility drafts</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Proposed structured rules from title, description and class definition.
          Approving writes them to the settlement. Nothing is applied automatically.
        </p>
      </header>
      <EligibilityDraftQueue items={drafts} />
    </div>
  );
}
