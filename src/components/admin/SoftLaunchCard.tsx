import type { BetaInviteStats } from '@/lib/beta-invite';
import type { SoftLaunchCounts } from '@/lib/soft-launch';
import { GATE_0_THRESHOLDS, gate0Progress } from '@/lib/soft-launch';
import { BetaInviteCodes } from '@/components/admin/BetaInviteCodes';

function formatCount(n: number): string {
  return n.toLocaleString();
}

export function SoftLaunchCard({
  counts,
  betaInvites,
}: {
  counts: SoftLaunchCounts;
  betaInvites?: BetaInviteStats[] | null;
}) {
  const rows: Array<[string, number]> = [
    ['Signups', counts.signups],
    ['Onboarded', counts.onboarded],
    ['Official-form clicks', counts.officialFormClicks],
    ['Filings reported', counts.filingsReported],
  ];
  const gate = gate0Progress(counts);
  const gateRows: Array<[string, string, boolean]> = [
    ['Signups', `${formatCount(gate.signups.current)} / ${formatCount(gate.signups.target)}`, gate.signups.met],
    [
      'Onboarded %',
      `${formatCount(gate.onboardedPercent.current)}% / ${formatCount(gate.onboardedPercent.target)}%`,
      gate.onboardedPercent.met,
    ],
    [
      'Official-form clicks',
      `${formatCount(gate.officialFormClicks.current)} / ${formatCount(gate.officialFormClicks.target)}`,
      gate.officialFormClicks.met,
    ],
    [
      'Filings reported',
      `${formatCount(gate.filingsReported.current)} / ${formatCount(gate.filingsReported.target)}`,
      gate.filingsReported.met,
    ],
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Soft launch</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Cohort starts with soft-. Internal testers are excluded.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <h4 className="text-sm font-bold text-ink">Gate 0</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Outreach stays blocked until these cohort counts are met
          ({GATE_0_THRESHOLDS.signups} signups, {GATE_0_THRESHOLDS.onboardedPercent}% onboarded,{' '}
          {GATE_0_THRESHOLDS.officialFormClicks} official-form clicks,{' '}
          {GATE_0_THRESHOLDS.filingsReported} filings reported). Current counts only — no
          projected progress.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {gateRows.map(([label, value, met]) => (
            <div key={label}>
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="text-sm font-bold tabular-nums">
                {value}
                <span className="ml-1 text-xs font-semibold text-ink-muted">{met ? 'met' : 'short'}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs font-semibold text-ink-muted">
          {gate.allMet ? 'Gate 0 counts are met.' : 'Gate 0 is not met.'}
        </p>
      </div>
      {betaInvites ? <BetaInviteCodes initialInvites={betaInvites} /> : null}
    </section>
  );
}
