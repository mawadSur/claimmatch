'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView, LaneView } from '@/lib/filing/v2/contract';
import { startFiling } from './filing-api';
import { laneTiming, laneTitle, lastDayLine } from './filing-model';
import { FormMessage } from './ui';

/**
 * The one-click entry on the claim page: shown only for a strong match whose
 * settlement has an agent lane (claim-page-data decides). Starting creates
 * the claim and its packet through the API; nothing is collected before the
 * member taps "Start my claim". The self-file steps stay below it.
 */
export function OneClickEntry({
  lane,
  lawsuitId,
  onStarted,
}: {
  lane: LaneView;
  lawsuitId: string;
  onStarted: (view: ClaimFilingView, message: string) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timing = laneTiming(lane);
  const lastDay = lastDayLine(lane);

  async function start() {
    setStarting(true);
    setError(null);
    const result = await startFiling(lawsuitId);
    setStarting(false);
    if (!result.ok) return setError(result.error.error);
    onStarted(result.data, ONE_CLICK_COPY.actions.started);
  }

  return (
    <section
      id="one-click"
      aria-labelledby="one-click-entry-title"
      className="scroll-mt-24 rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-card sm:p-6"
    >
      <h2 id="one-click-entry-title" className="text-lg font-bold">
        {laneTitle(lane)}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink">{ONE_CLICK_COPY.entry.intro}</p>
      {timing && <p className="mt-2 text-sm leading-relaxed text-ink">{timing}</p>}
      {lastDay && <p className="mt-1 text-sm leading-relaxed text-ink">{lastDay}</p>}
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{ONE_CLICK_COPY.payout}</p>
      <button type="button" className="btn-primary mt-4 w-full sm:w-auto" onClick={start} disabled={starting}>
        {starting ? ONE_CLICK_COPY.entry.starting : ONE_CLICK_COPY.entry.start}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <p className="mt-4 border-t border-brand-100 pt-3 text-sm leading-relaxed text-ink-muted">{ONE_CLICK_COPY.entry.orSelfFile}</p>
    </section>
  );
}
