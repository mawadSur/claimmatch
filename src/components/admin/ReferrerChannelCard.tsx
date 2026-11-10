import { Globe } from 'lucide-react';
import type { ChannelStat } from '@/lib/referrer-channel-stats';

/**
 * Signups and onboarded profiles by first-touch AI/search channel.
 * Counts only — no emails or other PII.
 */
export function ReferrerChannelCard({ rows }: { rows: ChannelStat[] }) {
  const total = rows.reduce((sum, row) => sum + row.signups, 0);
  return (
    <section aria-labelledby="referrer-channel-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
          <Globe className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 id="referrer-channel-title" className="text-lg font-bold text-ink">
            Signups by channel
          </h3>
          <p className="text-sm text-ink-soft">
            First-touch ChatGPT, Perplexity, Copilot/Bing, Gemini, Google organic, or other.
            {total === 0 ? ' No attributed signups yet.' : ` ${total.toLocaleString()} profile${total === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Channel</th>
              <th className="px-4 py-2 font-semibold tabular-nums">Signups</th>
              <th className="px-4 py-2 font-semibold tabular-nums">Onboarded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.channel}>
                <td className="px-4 py-2 font-medium text-ink">{row.label}</td>
                <td className="px-4 py-2 tabular-nums">{row.signups.toLocaleString()}</td>
                <td className="px-4 py-2 tabular-nums">{row.onboarded.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
