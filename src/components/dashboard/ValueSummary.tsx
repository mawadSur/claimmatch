import { Clock, HandCoins, ClipboardList, Scale, Sparkles } from 'lucide-react';
import { DASHBOARD_VALUE_COPY } from '@/lib/copy';
import type { DashboardValue } from '@/lib/dashboard-value';
import { OWED_ESTIMATE_ASSUMPTION, unstatedPayoutCopy } from '@/lib/owed-estimate';

const COPY = DASHBOARD_VALUE_COPY;

/**
 * Dashboard "What your membership has done so far" (DASHBOARD_VALUE_ENABLED).
 *
 * Reading rules this component keeps, deliberately:
 *  - Potential and actual sit in separate tiles with separate wording. The
 *    potential tile is brand-tinted and always says "Estimated"; the actual
 *    tiles name the member as the source.
 *  - The payout count and the payout amount are two tiles, never one figure.
 *    A member who reported a payout with no amount sees the count and a
 *    sentence, not "$0".
 *  - Every estimate prints its assumption underneath, in the member's view.
 *  - Where a figure cannot be computed honestly, the tile prints the reason in
 *    place of the number (the /scorecard precedent) instead of a zero.
 *
 * The caller decides whether to render this at all; buildDashboardValue returns
 * null when there is nothing on file.
 */
export function ValueSummary({ value }: { value: DashboardValue }) {
  const { potential, payouts, comparison } = value;
  const unstated = potential ? unstatedPayoutCopy(potential.unstatedCount) : null;
  return (
    <section aria-labelledby="value-summary-title" data-testid="dashboard-value">
      <h2 id="value-summary-title" className="text-2xl font-extrabold">
        {COPY.title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {potential && value.potentialLabel ? (
          <Tile
            icon={Sparkles}
            label={COPY.potentialLabel}
            figure={`${COPY.potentialPrefix} ${value.potentialLabel}`}
            note={unstated ? `${unstated}.` : null}
            assumption={OWED_ESTIMATE_ASSUMPTION}
            tone="brand"
          />
        ) : null}

        {payouts.count > 0 ? (
          <Tile
            icon={HandCoins}
            label={COPY.payoutCountLabel}
            figure={String(payouts.count)}
            note={COPY.payoutCountNote}
          />
        ) : null}

        {payouts.count > 0 ? (
          <Tile
            icon={HandCoins}
            label={COPY.payoutTotalLabel}
            figure={value.payoutTotalLabel}
            note={value.payoutTotalLabel ? COPY.payoutTotalNote : COPY.payoutNoAmount}
          />
        ) : null}

        {value.submittedCount > 0 ? (
          <Tile
            icon={ClipboardList}
            label={COPY.submittedLabel}
            figure={String(value.submittedCount)}
            note={COPY.submittedNote}
          />
        ) : null}

        {value.timeSaved ? (
          <Tile
            icon={Clock}
            label={COPY.timeSavedLabel}
            figure={value.timeSaved.label}
            assumption={value.timeSaved.assumption}
          />
        ) : null}

        <Tile
          icon={Scale}
          label={COPY.comparisonLabel}
          figure={comparison.multipleLabel}
          note={
            comparison.basis === 'actual'
              ? COPY.comparisonActualNote
              : comparison.basis === 'potential'
                ? COPY.comparisonPotentialNote
                : comparison.note
          }
          assumption={comparison.assumption}
        />
      </dl>
    </section>
  );
}

/**
 * One stat tile, shaped like the public /scorecard StatCard. `figure` may be
 * null: the tile then shows only its sentences, which is how an honest empty
 * state reads instead of a zero.
 */
function Tile({
  icon: Icon,
  label,
  figure,
  note = null,
  assumption = null,
  tone = 'plain',
}: {
  icon: typeof HandCoins;
  label: string;
  figure: string | null;
  note?: string | null;
  assumption?: string | null;
  tone?: 'plain' | 'brand';
}) {
  const shell =
    tone === 'brand'
      ? 'rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-card'
      : 'rounded-2xl border border-gray-100 bg-white p-5 shadow-card';
  return (
    <div className={shell}>
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-brand-600" aria-hidden />
        {label}
      </dt>
      <dd className="mt-3">
        {figure ? <p className="text-2xl font-extrabold text-ink">{figure}</p> : null}
        {note ? (
          <p className={`${figure ? 'mt-2 ' : ''}text-sm leading-relaxed text-ink-muted`}>{note}</p>
        ) : null}
        {assumption ? (
          <p className={`${figure || note ? 'mt-2 ' : ''}text-xs leading-relaxed text-ink-muted`}>
            {assumption}
          </p>
        ) : null}
      </dd>
    </div>
  );
}
