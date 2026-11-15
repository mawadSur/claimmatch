'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ExternalLink, ShieldCheck } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  canReportWithoutClaim, claimActionAvailability, daysUntilDeadline, deadlineCountdown, displayClaimStatus,
  lateReportLastDay, legacyFilingState, reportByDay,
  type ClaimDisplay, type ClaimTone, type ClaimView, type ProofNeed, type SettlementContext,
} from '@/lib/claims';
import { ClaimTimelineCard } from './ClaimTimeline';
import { formatDeadline } from '@/lib/utils';
import type { ClaimFlowSettlement, PacketProfile } from '@/lib/claim-screen';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { CorrectiveNotice, FictionalNotice } from './CorrectiveNotice';
import { PrefillPacket } from './PrefillPacket';
import { ReportFiled } from './ReportFiled';
import { UnverifiedLabel } from './UnverifiedLabel';
import { FILE_FOR_YOU_CTA, SELF_FILE_SECONDARY } from '@/lib/copy';
import { AuthorizeFiling } from './AuthorizeFiling';
import { ReportPayout } from './ReportPayout';
import { Announcement, ExternalTextLink } from '@/components/filing/claim-flow-parts';
import { useAfterFileTimeline, useClaimFlowFocus } from '@/components/filing/use-claim-flow-effects';
import { useOneClickClaim } from '@/components/filing/use-one-click-claim';
import type { OneClickClaimProps } from '@/components/filing/types';

// Defined in @/lib/claim-screen so the native app shares it; re-exported for existing imports.
export type { ClaimFlowSettlement } from '@/lib/claim-screen';

const PROOF_TEXT: Record<ProofNeed, string> = {
  required: 'Proof: required. Have your receipts, account statements or the notice you got ready.',
  optional: 'Proof: optional, but it may raise your payment.',
  none: 'Proof: our listing says none is needed. The official form has the final say.',
  unknown: 'Proof: check the official form. Some settlements ask for receipts or account records.',
};

/**
 * The Part A filing flow on /claim/[slug]: status and deadline at the top,
 * then (1) check you qualify, (2) file on the official site, (3) tell us you
 * filed. The official form opens in a new tab. With ONE_CLICK_FILING_ENABLED
 * on, `oneClick` adds one-click filing (src/components/filing); without it
 * the page is exactly as before.
 */
export function ClaimFlow({
  settlement,
  context,
  initialClaim,
  nowIso,
  profile = null,
  oneClick = null,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  initialClaim: ClaimView | null;
  nowIso: string;
  profile?: PacketProfile | null;
  oneClick?: OneClickClaimProps | null;
}) {
  const posthog = usePostHog();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || !posthog) return;
    viewed.current = true;
    posthog.capture('match_viewed', {
      lawsuit_id: settlement.id,
      slug: settlement.slug,
      source: 'claim_flow',
    });
  }, [posthog, settlement.id, settlement.slug, settlement.title]);
  const [claim, setClaim] = useState<ClaimView | null>(initialClaim);
  const [announcement, setAnnouncement] = useState('');

  const onChange = useCallback((next: ClaimView, message: string) => {
    setClaim(next);
    if (message) setAnnouncement(message);
  }, []);
  const oc = useOneClickClaim({ oneClick, claim, lawsuitId: settlement.id, setClaim, announce: setAnnouncement });
  // The retired assisted-filing form never shows while one-click filing is on.
  const stepsSettlement = oc ? { ...settlement, assistedFilingAllowed: false } : settlement;

  const display = claim ? displayClaimStatus(claim, context) : null;
  const reported = claim?.status === 'reported_filed' || display?.kind === 'submitted';
  const timeline = useAfterFileTimeline(settlement, claim);
  const { yourClaimHeading, announcementRef } = useClaimFlowFocus({ reported, showNotice: Boolean(display?.showNotice) });

  // Opening the form tracks nothing: people often open it only to read the
  // rules, and may find they don't qualify. The claim is saved when they tell
  // us they filed, or choose "Not yet: save to my claims".
  function openedOfficialForm() {
    posthog?.capture('official_form_opened', {
      lawsuit_id: settlement.id,
      slug: settlement.slug,
      intent: 'official_form',
      is_filing: false,
    });
  }

  let body: React.ReactNode;
  if (context.fictional && claim) {
    body = <FictionalNotice claimId={claim.id} title={settlement.title} acknowledged={!display?.showNotice} onAcknowledged={onChange} />;
  } else if (claim && display?.legacy && display.showNotice) {
    const filing = legacyFilingState(context);
    body = <CorrectiveNotice claimId={claim.id} deadline={settlement.deadline} filing={filing} officialUrl={settlement.officialUrl} onAnswered={onChange} />;
  } else if (oc?.active) {
    body = oc.flow;
  } else if (claim && reported) {
    body = (
      <section aria-labelledby="your-claim" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
        <h2 id="your-claim" ref={yourClaimHeading} tabIndex={-1} className="text-lg font-bold focus:outline-none">
          Your claim
        </h2>
        <div className="mt-4">
          <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
          {timeline ? <ClaimTimelineCard timeline={timeline} /> : null}
          {settlement.payoutReportEnabled ? (
            <ReportPayout claimId={claim.id} lawsuitId={settlement.id} enabled={settlement.payoutReportEnabled} />
          ) : null}
          {oc?.history}
        </div>
        {settlement.officialUrl && (
          <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-ink-muted">
            To check on your claim or update your details, use the{' '}
            <ExternalTextLink href={settlement.officialUrl}>official site</ExternalTextLink>.
          </p>
        )}
      </section>
    );
  } else if (context.deadlinePassed || (!initialClaim && !context.openForClaims)) {
    // After the deadline; or, with no claim at page load, a listing our list
    // marks closed (D41: still being re-checked). Keyed on the claim at load,
    // so the form stays in place while "I filed my claim" starts the claim.
    body = <NoLongerOpen settlement={settlement} context={context} claim={claim} onChange={onChange} />;
  } else {
    body = (
      <>
        <Caveat context={context} />
        {oc?.entry}
        <FilingSteps
          settlement={stepsSettlement} context={context} claim={claim} profile={profile}
          onChange={onChange} onOpenOfficialForm={openedOfficialForm}
          stepTwoTitle={oc?.stepTwoTitle} stepTwoLead={oc?.stepTwoLead} prepared={oc?.prepared}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <StatusPanel
        display={display} deadline={settlement.deadline} now={now} fictional={context.fictional}
        badge={oc?.badge} note={oc?.note}
      />
      <Announcement message={announcement} focusRef={announcementRef} />
      {body}
    </div>
  );
}

function StatusPanel({
  display,
  deadline,
  now,
  fictional,
  badge,
  note,
}: {
  display: ClaimDisplay | null;
  deadline: string | null;
  now: Date;
  fictional: boolean;
  /** One-click claims: the filing status (displayClaimStatus doesn't know it). */
  badge?: { label: string; tone: ClaimTone } | null;
  /** One-click filing on: the lane's note replaces the general one. */
  note?: string;
}) {
  if (fictional) {
    // No deadline or filing note: there is nothing to file.
    return (
      <section aria-label="Your claim" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Your claim</p>
        <div className="mt-2">
          {display && <ClaimStatusBadge label={display.label} tone={display.tone} />}
        </div>
      </section>
    );
  }
  const countdown = deadlineCountdown(deadline, now);
  const days = daysUntilDeadline(deadline, now);
  const countdownClass =
    days === null || days < 0 ? 'badge-gray' : days <= 14 ? 'badge-red' : 'badge-brand';
  const shown = badge ?? display;
  return (
    <section aria-label="Your claim and its deadline" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <dl className="grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Your claim</dt>
          <dd className="mt-2">
            {shown ? (
              <ClaimStatusBadge label={shown.label} tone={shown.tone} />
            ) : (
              <span className="badge-gray">Not tracking yet</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Deadline</dt>
          <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {deadline ? (
              <>
                <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
                {formatDeadline(deadline)}
                {countdown && <span className={countdownClass}>{countdown}</span>}
              </>
            ) : (
              <span className="font-normal text-ink-muted">
                We don&apos;t have a deadline listed. Check the official notice.
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-5 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        {note ? (
          <span>{note}</span>
        ) : (
          <span>
            Lawsuit AI doesn&rsquo;t file claims for you. You file on the official site,
            then tell us here so we can keep track. Check the official site for the
            exact deadline time.
          </span>
        )}
      </p>
    </section>
  );
}

function Caveat({ context }: { context: SettlementContext }) {
  let text: string | null = null;
  if (context.closedByStatus) {
    text = context.deadline
      ? "Our list marks this settlement as closed, but its deadline hasn't passed. We're re-checking it. Check the official site before you file."
      : "Our list marks this settlement as closed. We're re-checking it. Check the official site before you file.";
  } else if (context.known && !context.published) {
    text = 'This settlement is no longer listed on Lawsuit AI while we re-check it. Check the official site before you file.';
  }
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      {text}
    </p>
  );
}

function NoOfficialLink({ settlement }: { settlement: ClaimFlowSettlement }) {
  return (
    <p className="mt-3 text-sm leading-relaxed text-ink-muted">
      We don&rsquo;t have a link to the official site for this settlement.{' '}
      {settlement.sourceUrl ? (
        <>
          Our listing came from{' '}
          <ExternalTextLink href={settlement.sourceUrl}>{settlement.sourceHost ?? 'this source'}</ExternalTextLink>
          , which is not the official site. Look there for the official link.
        </>
      ) : (
        <>Use the link in the official notice you got by mail or email.</>
      )}{' '}
      Only file on the official site named in the notice.
    </p>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </li>
  );
}

function FilingSteps({
  settlement,
  context,
  claim,
  profile,
  onChange,
  onOpenOfficialForm,
  stepTwoTitle,
  stepTwoLead,
  prepared,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView | null;
  profile: PacketProfile | null;
  onChange: (claim: ClaimView, message: string) => void;
  onOpenOfficialForm: () => void;
  /** One-click filing on: "Finish on the official site", why Lawsuit AI can't file it, and prepared answers. */
  stepTwoTitle?: string;
  stepTwoLead?: React.ReactNode;
  prepared?: React.ReactNode;
}) {
  return (
    <ol className="space-y-5" aria-label="How to file">
      <Step n={1} title="Check that you qualify">
        {settlement.eligibility ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">What our listing says:</p>
            <p className="mt-1 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-ink">{settlement.eligibility}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              This is a short summary, not the official rules.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">We don&rsquo;t have the rules for who qualifies.</p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Read the official notice to be sure you qualify before you file. Only file
          if it describes you.
        </p>
        {settlement.officialUrl ? (
          <p className="mt-3 text-sm">
            <ExternalTextLink href={settlement.officialUrl}>Read the rules on the official site</ExternalTextLink>
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            We don&rsquo;t have a link to the official notice. Use the notice you got by
            mail or email, or see step 2.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <UnverifiedLabel className="self-start" />
          <span className="text-xs text-ink-muted">
            We haven&rsquo;t checked these details. The official site is the final word.
          </span>
        </div>
      </Step>

      <Step n={2} title={settlement.assistedFilingAllowed ? FILE_FOR_YOU_CTA : (stepTwoTitle ?? 'File on the official site')}>
        {stepTwoLead}
        {settlement.assistedFilingAllowed && (
          <AuthorizeFiling lawsuitId={settlement.id} claimId={claim?.id ?? null} />
        )}
        {settlement.officialUrl ? (
          <>
            <a
              href={settlement.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpenOfficialForm}
              className={
                settlement.assistedFilingAllowed
                  ? 'mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800'
                  : 'btn-primary mt-4 w-full sm:w-auto'
              }
            >
              {settlement.assistedFilingAllowed ? SELF_FILE_SECONDARY : 'Open the official claim form'}
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {!settlement.assistedFilingAllowed && (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                It opens in a new tab. Keep this page open so you can come back for
                step 3.
              </p>
            )}
          </>
        ) : (
          <NoOfficialLink settlement={settlement} />
        )}
        <h3 className="mt-5 text-sm font-bold">What you&rsquo;ll need</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>Your name, mailing address and email</li>
          <li>{PROOF_TEXT[settlement.proof]}</li>
          <li>
            The Notice ID or Claim ID from a letter or email you got about this settlement,
            if you have one (the form may ask for it)
          </li>
        </ul>
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          Filing is free. If a site asks you to pay to file a claim, stop. That is not
          the official site.
        </p>
        {prepared}
        <PrefillPacket profile={profile} lawsuitId={settlement.id} lawsuitSlug={settlement.slug} formFieldOrder={settlement.formFieldOrder} />
      </Step>

      <Step n={3} title="Tell us when you’ve filed">
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We&rsquo;ll keep your claim, deadline and confirmation number together on your{' '}
          <Link href="/dashboard" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
            dashboard
          </Link>
          .
        </p>
        <div className="mt-4">
          <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={context.openForClaims} onChange={onChange} />
        </div>
      </Step>
    </ol>
  );
}

/**
 * After the deadline, or (no claim at page load) a listing our list marks
 * closed. People who filed can still tell us until 30 days after the deadline.
 */
function NoLongerOpen({
  settlement,
  context,
  claim,
  onChange,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView | null;
  onChange: (claim: ClaimView, message: string) => void;
}) {
  const passed = context.deadlinePassed;
  const official = settlement.officialUrl;
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : canReportWithoutClaim(context);
  const lastDay = claim ? reportByDay(claim, settlement.deadline) : lateReportLastDay(settlement.deadline);
  return (
    <section aria-labelledby="no-longer-open" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
      <h2 id="no-longer-open" className="text-lg font-bold">
        {passed ? 'The deadline has passed' : 'Our list shows this settlement as closed'}
      </h2>
      {passed ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The deadline for this settlement was {formatDeadline(settlement.deadline)}.
          {canReport
            ? lastDay
              ? ` Did you file before then? Tell us by ${formatDeadline(lastDay)}.`
              : ' Did you file before then? Tell us below.'
            : ''}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We&rsquo;re re-checking it. Check the{' '}
          {official ? <ExternalTextLink href={official}>official site</ExternalTextLink> : 'official site'} to see
          if it still takes claims{official ? '.' : ': use the link in the notice you got by mail or email.'}{' '}
          Already filed? Tell us here, and we&rsquo;ll keep your claim and confirmation number in one place.
        </p>
      )}
      <div className="mt-4">
        <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
      </div>
      {passed && official && (
        <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-ink-muted">
          For updates, check the <ExternalTextLink href={official}>official site</ExternalTextLink>.
        </p>
      )}
    </section>
  );
}
