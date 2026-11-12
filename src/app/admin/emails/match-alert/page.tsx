import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin';
import { isPlausibleEmail } from '@/lib/unsubscribe';
import { previewMatchAlertEmail } from '@/lib/match-alert-email';

export const metadata: Metadata = { title: 'Match alert preview' };
export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Renders a sample match-alert email for a test address. Never sends.
 */
export default async function MatchAlertPreviewPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin('/admin/emails/match-alert');
  const sp = await searchParams;
  const rawTo = first(sp.to)?.trim() ?? 'preview@example.com';
  const to = isPlausibleEmail(rawTo) ? rawTo : 'preview@example.com';
  const html = previewMatchAlertEmail(to, 'Alex');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold">Match alert email preview</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Sample HTML only — this page never sends mail. Pass <code>?to=address@example.com</code>{' '}
          to render the footer unsubscribe link for that address. Turn on{' '}
          <code>MATCH_ALERT_EMAILS_ENABLED=1</code> and hit{' '}
          <code>/api/cron/match-alerts?dryRun=1</code> with the cron secret to see who would get a
          real send.
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Test address</span>
          <input
            type="email"
            name="to"
            defaultValue={to}
            className="field-input w-72"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn-secondary">
          Preview
        </button>
      </form>
      <iframe
        title="Match alert email preview"
        className="h-[720px] w-full rounded-2xl border border-gray-200 bg-white"
        srcDoc={html}
      />
    </div>
  );
}
