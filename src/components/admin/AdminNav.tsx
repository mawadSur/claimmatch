import { flags } from '@/lib/flags';
import { AdminNavLinks } from './AdminNavLinks';

export interface AdminNavCounts {
  pendingReview: number;
  awaitingPayout: number;
}

interface Props {
  counts?: AdminNavCounts;
}

/**
 * Admin section navigation. A server component, so the legacy Recoveries link
 * follows the server-side flag (ADMIN_RECOVERIES_ENABLED), never a NEXT_PUBLIC
 * value shipped to the browser.
 */
export function AdminNav({ counts }: Props) {
  return (
    <AdminNavLinks
      counts={counts}
      showRecoveries={flags.adminRecoveries()}
      showFiling={flags.assistedFiling()}
      showEligibilityDrafts={flags.eligibilityDrafts()}
    />
  );
}
