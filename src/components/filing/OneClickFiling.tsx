'use client';

import { useCallback, useState } from 'react';
import { ONE_CLICK_COPY, ONE_CLICK_SELF_FILE_TITLE, ONE_CLICK_STATUS } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import { ClaimStatusBadge } from '@/components/claims/ClaimStatusBadge';
import { FilingStep } from './claim-flow-parts';
import { ConfirmClassStep } from './ConfirmClassStep';
import { FilingActions } from './FilingActions';
import { getFiling, moveToSelfFile, updatePacket, type FilingResult } from './filing-api';
import {
  filingStatusDisplay,
  formatEventTime,
  isIntakeStatus,
  laneReasonLines,
  laneTiming,
  laneTitle,
  lastDayLine,
} from './filing-model';
import { FilingPath, FilingTimeline } from './FilingTimeline';
import { PacketItemsStep } from './PacketItemsStep';
import type { PacketPatch } from './packet-form';
import { ReviewSignStep } from './ReviewSignStep';
import { FormMessage } from './ui';

type OnView = (view: ClaimFilingView, message: string) => void;

/**
 * One-click filing for one claim on /claim/[slug]: while the packet is open,
 * (1) confirm the class definition, (2) what we still need, (3) review and
 * sign, then "File my claim"; after that, the status card with the timeline.
 * Every change goes through the member API; the new view comes back to
 * ClaimFlow (onChange), which keeps the page's claim in step.
 */
export function OneClickFiling({
  view,
  accountEmail,
  onChange,
}: {
  view: ClaimFilingView;
  accountEmail: string | null;
  onChange: OnView;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const claimId = view.claim.id;
  const revision = view.packet?.revision ?? 1;

  const refresh = useCallback(
    async (text: string) => {
      const result = await getFiling(claimId);
      if (result.ok) {
        setMessage(null);
        onChange(result.data, text);
      } else setMessage(result.error.error);
    },
    [claimId, onChange],
  );

  const save = useCallback(
    async (patch: PacketPatch): Promise<FilingResult<ClaimFilingView>> => {
      setBusy(true);
      const result = await updatePacket(claimId, { revision, ...patch });
      setBusy(false);
      if (result.ok) onChange(result.data, '');
      else if (result.error.code === 'revision_conflict' || result.error.code === 'packet_locked') await refresh('');
      return result;
    },
    [claimId, revision, onChange, refresh],
  );

  const status = view.claim.status;
  const packet = view.packet;
  if (!packet || packet.status !== 'open' || !isIntakeStatus(status)) {
    return <FilingStatusCard view={view} busy={busy} onView={onChange} message={message} />;
  }
  const n = packet.spec ? 1 : 0;
  const steps = ONE_CLICK_COPY.steps;

  return (
    <div id="one-click" className="scroll-mt-24 space-y-5">
      <LaneCard view={view} />
      <ol className="space-y-5" aria-label={ONE_CLICK_COPY.stepsLabel}>
        {packet.spec && (
          <FilingStep n={1} title={steps.confirm}>
            <ConfirmClassStep view={view} busy={busy} save={save} />
          </FilingStep>
        )}
        <FilingStep n={n + 1} title={steps.need}>
          <PacketItemsStep view={view} busy={busy} save={save} refresh={refresh} />
        </FilingStep>
        <FilingStep n={n + 2} title={view.lane.agent ? steps.review : ONE_CLICK_SELF_FILE_TITLE}>
          {view.lane.agent ? (
            <ReviewSignStep view={view} accountEmail={accountEmail} busy={busy} onView={onChange} refresh={refresh} />
          ) : (
            <SelfFileLaneStep view={view} busy={busy} onView={onChange} />
          )}
        </FilingStep>
      </ol>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
        {message && <FormMessage tone="error">{message}</FormMessage>}
        <FilingActions view={view} busy={busy} onView={onChange} />
        <FilingTimeline entries={view.timeline} />
      </div>
    </div>
  );
}

/** The lane at the top of the steps: "Lawsuit AI files this claim for you" and what happens next, or why it can't. */
function LaneCard({ view }: { view: ClaimFilingView }) {
  const timing = laneTiming(view.lane);
  const lastDay = lastDayLine(view.lane);
  const reasons = laneReasonLines(view.lane);
  return (
    <section aria-labelledby="filing-lane-title" className="rounded-2xl border border-brand-100 bg-brand-50/40 p-5 sm:p-6">
      <h2 id="filing-lane-title" className="text-lg font-bold">
        {laneTitle(view.lane)}
      </h2>
      {view.claim.status === 'needs_you' && (
        <p role="alert" className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-danger-700">
          {ONE_CLICK_STATUS.needs_you.detail}
        </p>
      )}
      {timing && <p className="mt-2 text-sm leading-relaxed text-ink">{timing}</p>}
      {lastDay && <p className="mt-1 text-sm leading-relaxed text-ink">{lastDay}</p>}
      {view.lane.agent && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{ONE_CLICK_COPY.payout}</p>}
      {reasons.map((reason) => (
        <p key={reason} className="mt-2 text-sm leading-relaxed text-ink-muted">
          {reason}
        </p>
      ))}
    </section>
  );
}

/** The packet is open but this settlement's lane is self-file now: say why and move on to the official site. */
function SelfFileLaneStep({ view, busy, onView }: { view: ClaimFilingView; busy: boolean; onView: OnView }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setWorking(true);
    setError(null);
    const result = await moveToSelfFile(view.claim.id);
    setWorking(false);
    if (!result.ok) return setError(result.error.error);
    onView(result.data, ONE_CLICK_COPY.actions.selfFileDone);
  }
  return (
    <div className="mt-2">
      {laneReasonLines(view.lane).map((reason) => (
        <p key={reason} className="text-sm leading-relaxed text-ink-muted">
          {reason}
        </p>
      ))}
      {view.actions.can_self_file && (
        <button type="button" className="btn-primary mt-3 w-full sm:w-auto" onClick={go} disabled={busy || working}>
          {working ? ONE_CLICK_COPY.actions.working : ONE_CLICK_SELF_FILE_TITLE}
        </button>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}

/** After signing (and for closed claims): the status, what happens next, the actions left and the timeline. */
export function FilingStatusCard({
  view,
  busy,
  onView,
  message = null,
}: {
  view: ClaimFilingView;
  busy: boolean;
  onView: OnView;
  message?: string | null;
}) {
  const status = view.claim.status;
  const display = filingStatusDisplay(status, view.claim.confirmation_number);
  const timing = status === 'signed' || status === 'queued' ? laneTiming(view.lane) : null;
  return (
    <section
      id="one-click"
      aria-labelledby="filing-status-title"
      className="scroll-mt-24 rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 id="filing-status-title" className="text-lg font-bold">
        {ONE_CLICK_COPY.steps.status}
      </h2>
      <div className="mt-3">
        <ClaimStatusBadge label={display.label} tone={display.tone} />
      </div>
      {display.detail && <p className="mt-3 text-sm leading-relaxed text-ink">{display.detail}</p>}
      {timing && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{timing}</p>}
      {view.signature && (
        <p className="mt-2 text-sm text-ink-muted">
          {ONE_CLICK_COPY.signedBy(view.signature.typed_name, formatEventTime(view.signature.signed_at))}
        </p>
      )}
      <FilingPath status={status} />
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <FilingActions view={view} busy={busy} onView={onView} />
      <FilingTimeline entries={view.timeline} />
    </section>
  );
}
