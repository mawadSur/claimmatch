'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  claimActionAvailability,
  daysUntilDeadline,
  deadlineCountdown,
  displayClaimStatus,
  lateReportLastDay,
  type ClaimDisplay,
  type ClaimView,
  type ProofNeed,
  type SettlementContext,
} from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';
import { startTracking } from './claim-api';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { CorrectiveNotice, FictionalNotice } from './CorrectiveNotice';
import { ReportFiled } from './ReportFiled';
import { UnverifiedLabel } from './UnverifiedLabel';

export interface ClaimFlowSettlement {
  id: string;
  slug: string;
  title: string;
  deadline: string | null;
  /** The official claim site (claim_url), when we have a real link. */
  officialUrl: string | null;
  /** Where the listing came from (not an official site). */
  sourceUrl: string | null;
  sourceHost: string | null;
  /** The listing's eligibility text, or null when it is only a placeholder. */
  eligibility: string | null;
  proof: ProofNeed;
}

const PROOF_TEXT: Record<ProofNeed, string> = {
  required: 'Proof: required. Have your receipts, account statements or the notice you got ready.',
  optional: 'Proof: optional, but it may raise your payment.',
  none: 'Proof: our listing says none is needed. The official form has the final say.',
  unknown: 'Proof: check the official form. Some settlements ask for receipts or account records.',
};

/**
 * The Part A filing flow on /claim/[slug]: status and deadline at the top,
 * then (1) check you qualify, (2) file on the official site, (3) tell us you
 * filed. ClaimMatch never files: the official form opens in a new tab.
 */
export function ClaimFlow({
  settlement,
  context,
  initialClaim,
  nowIso,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  initialClaim: ClaimView | null;
  nowIso: string;
}) {
  const posthog = usePostHog();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [claim, setClaim] = useState<ClaimView | null>(initialClaim);
  const [announcement, setAnnouncement] = useState('');

  const onChange = useCallback((next: ClaimView, message: string) => {
    setClaim(next);
    if (message) setAnnouncement(message);
  }, []);

  const display = claim ? displayClaimStatus(claim, context) : null;
  const reported = claim?.status === 'reported_filed' || display?.kind === 'submitted';

  function openedOfficialForm() {
    posthog?.capture('official_form_opened');
    if (claim || !context.openForClaims) return;
    // Start tracking in the background; the official site opens in a new tab.
    void startTracking(settlement.id).then((result) => {
      if (!result.ok) return;
      posthog?.capture('claim_tracking_started');
      onChange(result.claim, 'We added this settlement to your claims as Not filed yet.');
    });
  }

  let body: React.ReactNode;
  if (context.fictional && claim) {
    body = (
      <FictionalNotice
        claimId={claim.id}
        title={settlement.title}
        acknowledged={!display?.showNotice}
        onAcknowledged={onChange}
      />
    );
  } else if (claim && display?.legacy && display.showNotice) {
    body = (
      <CorrectiveNotice
        claimId={claim.id}
        deadline={settlement.deadline}
        deadlinePassed={context.deadlinePassed}
        officialUrl={settlement.officialUrl}
        onAnswered={onChange}
      />
    );
  } else if (claim && reported) {
    body = (
      <section aria-labelledby="your-claim" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
        <h2 id="your-claim" className="text-lg font-bold">Your claim</h2>
        <div className="mt-4">
          <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
        </div>
        {settlement.officialUrl && (
          <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-ink-muted">
            To check on your claim or update your details, use the{' '}
            <ExternalTextLink href={settlement.officialUrl}>official site</ExternalTextLink>.
          </p>
        )}
      </section>
    );
  } else if (context.deadlinePassed) {
    body = <DeadlinePassed settlement={settlement} context={context} claim={claim} onChange={onChange} />;
  } else {
    body = (
      <>
        <Caveat context={context} />
        <FilingSteps
          settlement={settlement}
          context={context}
          claim={claim}
          onChange={onChange}
          onOpenOfficialForm={openedOfficialForm}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <StatusPanel display={display} deadline={settlement.deadline} now={now} />
      <div role="status" aria-live="polite">
        {announcement && (
          <p className="flex items-start gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {announcement}
          </p>
        )}
      </div>
      {body}
    </div>
  );
}

function StatusPanel({ display, deadline, now }: { display: ClaimDisplay | null; deadline: string | null; now: Date }) {
  const countdown = deadlineCountdown(deadline, now);
  const days = daysUntilDeadline(deadline, now);
  const countdownClass =
    days === null || days < 0 ? 'badge-gray' : days <= 14 ? 'badge-red' : 'badge-brand';
  return (
    <section aria-label="Your claim and its deadline" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <dl className="grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Your claim</dt>
          <dd className="mt-2">
            {display ? (
              <ClaimStatusBadge label={display.label} tone={display.tone} />
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
              <span className="font-normal text-ink-muted">Not listed. Check the official site.</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-5 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span>
          ClaimMatch doesn&rsquo;t file claims for you. You file on the official site,
          then tell us here so we can keep track. Check the official site for the
          exact deadline time.
        </span>
      </p>
    </section>
  );
}

function Caveat({ context }: { context: SettlementContext }) {
  let text: string | null = null;
  if (context.closedByStatus) {
    text = "Our list marks this settlement as closed, but its deadline hasn't passed. We're re-checking it. Check the official site before you file.";
  } else if (context.known && !context.published) {
    text = 'This settlement is no longer listed on ClaimMatch while we re-check it. Check the official site before you file.';
  }
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      {text}
    </p>
  );
}

function ExternalTextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
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
  onChange,
  onOpenOfficialForm,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView | null;
  onChange: (claim: ClaimView, message: string) => void;
  onOpenOfficialForm: () => void;
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
          <NoOfficialLink settlement={settlement} />
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <UnverifiedLabel className="self-start" />
          <span className="text-xs text-ink-muted">
            We haven&rsquo;t checked these details. The official site is the final word.
          </span>
        </div>
      </Step>

      <Step n={2} title="File on the official site">
        {settlement.officialUrl ? (
          <>
            <a
              href={settlement.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpenOfficialForm}
              className="btn-primary mt-4 w-full sm:w-auto"
            >
              Open the official claim form
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              It opens in a new tab. Keep this page open so you can come back for
              step 3.
            </p>
          </>
        ) : (
          <NoOfficialLink settlement={settlement} />
        )}
        <h3 className="mt-5 text-sm font-bold">What you&rsquo;ll need</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>Your name, mailing address and email</li>
          <li>{PROOF_TEXT[settlement.proof]}</li>
          <li>Any claim ID or notice ID from a letter or email about this settlement, if you got one</li>
        </ul>
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          Filing is free. If a site asks you to pay to file a claim, stop. That is not
          the official site.
        </p>
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
          <ReportFiled
            lawsuitId={settlement.id}
            claim={claim}
            context={context}
            allowSave={context.openForClaims}
            onChange={onChange}
          />
        </div>
      </Step>
    </ol>
  );
}

function DeadlinePassed({
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
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : false;
  const lastDay = lateReportLastDay(settlement.deadline);
  return (
    <section aria-labelledby="deadline-passed" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
      <h2 id="deadline-passed" className="text-lg font-bold">The deadline has passed</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        The deadline for this settlement was {formatDeadline(settlement.deadline)}.
        {canReport && lastDay
          ? ` Did you file before then? Tell us by ${formatDeadline(lastDay)}.`
          : ''}
      </p>
      <div className="mt-4">
        <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
      </div>
      {settlement.officialUrl && (
        <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-ink-muted">
          For updates, check the <ExternalTextLink href={settlement.officialUrl}>official site</ExternalTextLink>.
        </p>
      )}
    </section>
  );
}
