import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, ExternalLink } from 'lucide-react';
import type { HomeSettlementCard } from '@/lib/home-catalog';
import type { Lawsuit } from '@/lib/types';
import { deadlineUrgencyLabel, formatDeadline } from '@/lib/utils';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { officialLinkFor } from '@/lib/lawsuit-display';
import { flags } from '@/lib/flags';
import { catalogCardDeadlineLabel, catalogCardPayout } from '@/lib/catalog-unknowns';
import { ClosesInChip } from '@/components/settlement/ClosesInChip';
import { VerifiedBadge } from '@/components/settlement/VerifiedBadge';
import { ListingVerification } from '@/components/settlement/ListingVerification';
import { EasySubmitBadge, shouldHideFileButton } from '@/components/claims/ClaimActionCta';
import {
  NO_CLAIM_NEEDED_HEADING,
  START_CLAIM_CTA,
  cardCtaHref,
  cardCtaLabel,
} from '@/lib/claim-actions';

/** "Jan" / "22" for the calendar badge. Deadlines are calendar dates, so read them as UTC. */
function badgeParts(deadline: string | null): { month: string; day: string } | null {
  if (!deadline) return null;
  const d = new Date(`${deadline.trim().slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
  };
}

function idSet(ids?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> | undefined {
  if (!ids) return undefined;
  return ids instanceof Set ? ids : new Set(ids);
}

export function HomeSettlementList({
  lawsuits,
  easySubmitIds,
  closesInChips = flags.closesInChips(),
  claimActionCtas = flags.claimActionCtas(),
  verifiedFields = flags.verifiedFields(),
  catalogHideUnknowns = flags.catalogHideUnknowns(),
  noticeChecked,
}: {
  lawsuits: Array<Lawsuit | HomeSettlementCard>;
  /** Approved filing spec + policy IDs (oneClickLawsuitIdSet). */
  easySubmitIds?: ReadonlySet<string> | readonly string[];
  closesInChips?: boolean;
  claimActionCtas?: boolean;
  verifiedFields?: boolean;
  catalogHideUnknowns?: boolean;
  /** Server-computed noticeCheckedOnLabel by slug (keeps guides off the client). */
  noticeChecked?: Readonly<Record<string, string | null>>;
}) {
  const approvedIds = idSet(easySubmitIds);
  const cards = (
    <ul className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      {lawsuits.map((lawsuit, i) => {
        const open = isOpenForClaims(lawsuit);
        const urgency = open ? deadlineUrgencyLabel(lawsuit.deadline) : null;
        const badge = badgeParts(lawsuit.deadline);
        const payoutShown = catalogCardPayout(lawsuit.typical_payout, catalogHideUnknowns);
        const deadlineShown = catalogCardDeadlineLabel(
          lawsuit.deadline,
          lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null,
          catalogHideUnknowns,
        );
        return (
          <li
            key={lawsuit.id}
            data-reveal
            style={{ '--reveal-at': i * 4 } as CSSProperties}
            className="flex flex-col gap-5 p-5 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6"
          >
            <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
              {badge && (
                <div
                  aria-hidden
                  className="w-14 shrink-0 overflow-hidden rounded-xl bg-white text-center shadow-sm ring-1 ring-slate-200"
                >
                  <div className="bg-brand-700 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                    {badge.month}
                  </div>
                  <div className="py-1.5 font-display text-2xl font-medium leading-none text-ink">
                    {badge.day}
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {lawsuit.category}
                  </span>
                  <EasySubmitBadge
                    type={lawsuit.claim_action_type}
                    approved={approvedIds?.has(lawsuit.id) ?? false}
                    enabled={claimActionCtas}
                  />
                  <VerifiedBadge lawsuit={lawsuit} enabled={verifiedFields} />
                  <ClosesInChip deadline={lawsuit.deadline} enabled={closesInChips} />
                  {!closesInChips && urgency && (
                    <span className="badge-red gap-1">
                      <Clock className="h-3 w-3" aria-hidden /> {urgency}
                    </span>
                  )}
                </div>
                <Link
                  href={`/lawsuits/${lawsuit.slug}`}
                  className="mt-1 block rounded text-lg font-semibold leading-snug text-ink hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {lawsuit.title}
                </Link>
                <ListingVerification
                  lawsuit={lawsuit}
                  official={officialLinkFor(lawsuit)}
                  compact
                  open={open}
                  verifiedFields={verifiedFields}
                  checkedLabel={noticeChecked?.[lawsuit.slug] ?? null}
                />
                <dl className="mt-2.5 grid gap-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_11.5rem] sm:gap-x-8">
                  {payoutShown ? (
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-ink-muted">Payout</dt>
                      <dd className="line-clamp-2 font-semibold text-gold-700">
                        {payoutShown}
                      </dd>
                    </div>
                  ) : null}
                  {deadlineShown ? (
                    <div className="flex gap-1.5">
                      <dt className="text-ink-muted">Deadline</dt>
                      <dd className="font-semibold text-ink">{deadlineShown}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 flex-col gap-1 sm:items-end">
              {open && shouldHideFileButton(lawsuit.claim_action_type, claimActionCtas) ? (
                <p className="max-w-[16rem] rounded-lg bg-brand-50 px-3 py-2 text-center text-sm font-semibold text-ink">
                  {lawsuit.claim_action_type === 'automatic_payment'
                    ? NO_CLAIM_NEEDED_HEADING
                    : 'Not open for claims'}
                </p>
              ) : open ? (
                <HomeRowCta
                  lawsuit={lawsuit}
                  approved={approvedIds?.has(lawsuit.id) ?? false}
                  claimActionCtas={claimActionCtas}
                />
              ) : (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-ink-muted">
                  Claims closed
                </p>
              )}
              <Link
                href={`/lawsuits/${lawsuit.slug}`}
                className="inline-flex min-h-tap items-center justify-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Details <ArrowRight className="h-4 w-4" aria-hidden />
                <span className="sr-only"> about {lawsuit.title}</span>
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div>
      {cards}
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Lawsuit AI is not affiliated with the settlements listed here or their administrators.
      </p>
    </div>
  );
}

function HomeRowCta({
  lawsuit,
  approved = false,
  claimActionCtas = flags.claimActionCtas(),
}: {
  lawsuit: Lawsuit | HomeSettlementCard;
  approved?: boolean;
  claimActionCtas?: boolean;
}) {
  const official = officialLinkFor(lawsuit);
  const href = claimActionCtas
    ? cardCtaHref({
        type: lawsuit.claim_action_type,
        slug: lawsuit.slug,
        officialHref: official?.kind === 'official' ? official.href : null,
        approved,
      })
    : `/claim/${lawsuit.slug}`;
  const label = claimActionCtas ? cardCtaLabel(lawsuit.claim_action_type, approved) : START_CLAIM_CTA;
  const className = 'btn-primary w-full !py-2.5 sm:w-auto';
  const body = (
    <>
      {label}
      {href.startsWith('http') ? (
        <ExternalLink className="h-4 w-4" aria-hidden />
      ) : (
        <ArrowRight className="h-4 w-4" aria-hidden />
      )}
      <span className="sr-only"> for {lawsuit.title}</span>
    </>
  );
  if (href.startsWith('http')) {
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
