import Link from 'next/link';
import { ArrowRight, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { deadlineUrgencyLabel, formatDeadline } from '@/lib/utils';
import { flags } from '@/lib/flags';
import { displaySummary, isOpenForClaims, officialLinkFor } from '@/lib/lawsuits';
import { showVerifiedBadge } from '@/lib/verified-fields';
import {
  catalogCardDeadlineLabel,
  catalogCardMissing,
  catalogCardPayout,
  catalogCardProof,
} from '@/lib/catalog-unknowns';
import { ClosesInChip } from '@/components/settlement/ClosesInChip';
import { VerifiedBadge } from '@/components/settlement/VerifiedBadge';
import { MissingDetailsBlock } from '@/components/settlement/AnswerBlock';
import { EasySubmitBadge, shouldHideFileButton } from '@/components/claims/ClaimActionCta';
import {
  NO_CLAIM_NEEDED_HEADING,
  START_CLAIM_CTA,
  cardCtaHref,
  cardCtaLabel,
  statusChipLabel,
} from '@/lib/claim-actions';

/**
 * The settlement card (server component; brand top border from the original
 * site). It shows the payout as the source states it, the proof rule and the
 * deadline, a Verified chip when the listing is verified, the source link,
 * and "Start your claim" while the settlement is open for
 * claims. A settlement that is not open shows "Claims closed" and no call to
 * action.
 *
 * `badge` replaces the category label, e.g. a claim status on the dashboard.
 * Labels with a percentage or "Matched" are dropped: Lawsuit AI shows no match
 * scores (D50). `href` changes where the title links (default: the settlement
 * page).
 */
export function LawsuitCard({
  lawsuit,
  badge,
  reasons,
  href,
  fileForYou: _fileForYou = false,
}: {
  lawsuit: Lawsuit;
  badge?: { label: string; tone?: 'brand' | 'green' | 'red' | 'gray' };
  reasons?: string[];
  href?: string;
  fileForYou?: boolean;
}) {
  const open = isOpenForClaims(lawsuit);
  const urgency = open ? deadlineUrgencyLabel(lawsuit.deadline) : null;
  const detailsHref = `/lawsuits/${lawsuit.slug}`;
  const titleHref = href ?? detailsHref;
  const official = officialLinkFor(lawsuit);
  const summary = displaySummary(lawsuit);
  const shownBadge = badge && isAllowedBadge(badge.label) ? badge : undefined;
  const verified = showVerifiedBadge(lawsuit);
  const proofShown = catalogCardProof(lawsuit);
  const payoutShown = catalogCardPayout(lawsuit.typical_payout);
  const deadlineShown = catalogCardDeadlineLabel(
    lawsuit.deadline,
    lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null,
  );
  const missing = catalogCardMissing(lawsuit);

  const tone = shownBadge?.tone ?? 'brand';
  const badgeClass =
    tone === 'green' ? 'badge-green'
    : tone === 'red' ? 'badge-red'
    : tone === 'gray' ? 'badge-gray'
    : 'badge-brand';

  return (
    <article className="settlement-card group h-full">
      <div className="flex items-start justify-between gap-3">
        <span className={badgeClass}>{shownBadge?.label ?? lawsuit.category}</span>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <EasySubmitBadge type={lawsuit.claim_action_type} />
          <VerifiedBadge lawsuit={lawsuit} />
          <ClosesInChip deadline={lawsuit.deadline} />
          {!flags.closesInChips() && urgency && (
            <span className="badge-red shrink-0 gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" /> {urgency}
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug">
        <Link
          href={titleHref}
          className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {lawsuit.title}
        </Link>
      </h3>

      {summary && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{summary}</p>}

      {reasons && reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-success-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      )}

      {!lawsuit.deadline && deadlineShown && (
        <p className="mt-3 inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-ink-muted">
          No deadline listed
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-brand-50 p-3">
        {deadlineShown ? <Stat label="Deadline" value={deadlineShown} /> : null}
        {proofShown ? <Stat label="Proof" value={proofShown} /> : null}
        {payoutShown ? (
          <div className="col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Payout, as listed
            </dt>
            <dd className="mt-0.5 line-clamp-2 text-sm font-semibold text-ink">{payoutShown}</dd>
          </div>
        ) : null}
      </dl>
      {missing.length > 0 ? <MissingDetailsBlock missing={missing} official={official} /> : null}

      <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
        {verified ? (
          <span className="font-semibold text-success-700">Verified</span>
        ) : null}
        {verified ? <span aria-hidden>·</span> : null}
        <span>
          {official ? (
            <a
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded font-semibold underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {official.label}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> for {lawsuit.title} (opens in a new tab)</span>
            </a>
          ) : (
            'We don’t have its link yet.'
          )}
        </span>
      </p>

      <div className="mt-auto pt-4">
        {open ? (
          shouldHideFileButton(lawsuit.claim_action_type) ? (
            <div className="space-y-2">
              {lawsuit.claim_action_type === 'automatic_payment' ? (
                <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-ink">
                  {NO_CLAIM_NEEDED_HEADING}
                </p>
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">
                  {statusChipLabel(lawsuit.claim_action_type, false).label}
                </p>
              )}
              <Link href={detailsHref} className="btn-secondary w-full justify-center px-3">
                Details<span className="sr-only"> about {lawsuit.title}</span>
              </Link>
            </div>
          ) : (
          <div className="flex min-w-0 flex-wrap gap-2">
            <CtaLink
              href={cardCtaHref({
                type: flags.claimActionCtas() ? lawsuit.claim_action_type : null,
                slug: lawsuit.slug,
                officialHref: official?.kind === 'official' ? official.href : null,
              })}
              label={flags.claimActionCtas() ? cardCtaLabel(lawsuit.claim_action_type) : START_CLAIM_CTA}
              title={lawsuit.title}
            />
            <Link href={detailsHref} className="btn-secondary min-w-0 grow basis-20 px-3">
              Details<span className="sr-only"> about {lawsuit.title}</span>
            </Link>
          </div>
          )
        ) : (
          <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-center text-sm font-semibold text-ink-muted">
            Claims closed
          </p>
        )}
      </div>
    </article>
  );
}

function CtaLink({ href, label, title }: { href: string; label: string; title: string }) {
  const external = href.startsWith('http');
  const className = 'btn-primary min-w-0 grow basis-40 px-3';
  const body = (
    <>
      {label} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only"> for {title}</span>
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** No match scores or "Matched" labels on cards (D50; no percentage scores anywhere). */
function isAllowedBadge(label: string): boolean {
  return !label.includes('%') && !/\bmatched\b/i.test(label);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
