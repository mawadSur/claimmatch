import { FlaskConical } from 'lucide-react';
import { oneClickTestMode } from '@/lib/filing/one-click-access';

/**
 * Server component. While ONE_CLICK_FILING_TEST_MODE is the only reason the
 * console is open, every filing page says so: jobs are test jobs, emails go
 * only to the test inbox, and members other than testers cannot see one-click.
 */
export function TestModeBanner() {
  if (!oneClickTestMode()) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border-2 border-gold-100 bg-gold-50 p-4 text-sm text-gold-700"
    >
      <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p>
        <strong>TEST MODE.</strong> One-click filing is on for internal testers only. Every new job is a test job, filing
        emails go only to the test inbox, and nothing is sent to a real settlement administrator.
      </p>
    </div>
  );
}
