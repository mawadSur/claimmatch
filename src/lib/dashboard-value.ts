/**
 * Dashboard value counter (DASHBOARD_VALUE_ENABLED). Pure maths for "what has
 * this membership been worth to me", kept out of the components so the honesty
 * rules are testable.
 *
 * The rules this module exists to enforce:
 *  - Potential and actual never mix. Potential comes from listed settlement
 *    payout ranges (owed-estimate.ts, which never reads recoveries); actual
 *    comes only from recoveries rows the member typed in themselves.
 *  - The payout COUNT and the payout TOTAL stay two separate facts. A blank
 *    amount stores gross_amount 0 (payout-report.ts), so "2 payouts reported"
 *    and "no amount recorded" are both true at once; merging them into one
 *    headline would read as "you made $0".
 *  - Every estimate carries its assumption as text the member can read, not as
 *    a code comment: 20 minutes per claim, and the monthly list price times the
 *    months subscribed.
 *  - A figure that cannot be computed honestly returns null, with a sentence
 *    saying why, so the UI shows an explanation where the number would be
 *    rather than a zero that looks like a loss or an estimate that looks like
 *    income.
 */
import { hasConfirmationNumber } from '@/lib/claims';
import {
  CLAIMMATCH_MEMBERSHIP_PRICE_CENTS,
  DASHBOARD_VALUE_COPY,
  membershipPriceCopy,
} from '@/lib/copy';
import {
  finitePayoutAmount,
  owedRangeLabel,
  visibleOwedEstimate,
  type MatchPayoutTerms,
  type OwedEstimate,
} from '@/lib/owed-estimate';
import { formatUsd } from '@/lib/scorecard';

/**
 * The one invented number on this panel. Nothing in the product measures how
 * long a claim takes, so this is an assumption, and timeSavedAssumption()
 * prints it next to every figure derived from it.
 */
export const ASSUMED_MINUTES_PER_CLAIM = 20;

/**
 * Statuses that mean the claim reached an administrator. 'submitted' needs a
 * confirmation number: the retired e-sign flow wrote bare 'submitted' rows
 * although nothing was filed (isLegacyClaim, claims.ts), and those must not be
 * counted. 'filed_by_claimmatch' is listed because displayClaimStatus groups it
 * under 'in_process', so a group-based tally would miss it.
 */
export const SUBMITTED_CLAIM_STATUSES = ['reported_filed', 'submitted', 'filed_by_claimmatch'] as const;

export interface SubmittedClaimFields {
  id?: string | null;
  status: string;
  confirmation_number?: string | null;
}

export function isSubmittedClaim(claim: SubmittedClaimFields): boolean {
  if (claim.status === 'reported_filed' || claim.status === 'filed_by_claimmatch') return true;
  return claim.status === 'submitted' && hasConfirmationNumber(claim);
}

/** Counts one source only. Repeated ids collapse, so a claim listed twice counts once. */
export function countSubmittedClaims(claims: readonly SubmittedClaimFields[]): number {
  const seen = new Set<string>();
  let anonymous = 0;
  for (const claim of claims) {
    if (!isSubmittedClaim(claim)) continue;
    const id = typeof claim.id === 'string' ? claim.id.trim() : '';
    if (id) seen.add(id);
    else anonymous += 1;
  }
  return seen.size + anonymous;
}

export interface ReportedPayoutRow {
  gross_amount?: number | string | null;
}

export interface ReportedPayouts {
  /** Rows the member reported, whatever amount they gave. */
  count: number;
  /** Sum of the amounts that are present and positive. Never a prediction. */
  total: number;
}

/**
 * Mirrors sumPayoutsExcludingInternal (scorecard.ts) without the internal-id
 * filter: a member always sees their own rows. Every row raises the count; only
 * a finite, positive amount raises the total.
 */
export function sumReportedPayouts(rows: readonly ReportedPayoutRow[]): ReportedPayouts {
  let count = 0;
  let total = 0;
  for (const row of rows) {
    count += 1;
    const amount = finitePayoutAmount(row.gross_amount);
    if (amount != null && amount > 0) total += amount;
  }
  return { count, total };
}

export interface TimeSavedEstimate {
  minutes: number;
  /** "40 minutes" / "1.5 hours". Always rendered beside the assumption. */
  label: string;
  assumption: string;
}

export function timeSavedAssumption(minutesPerClaim = ASSUMED_MINUTES_PER_CLAIM): string {
  return `${DASHBOARD_VALUE_COPY.estimateWord} Assumes ${minutesPerClaim} minutes per claim. Lawsuit AI does not measure how long a claim takes, so this is an assumption, not a measurement.`;
}

function timeSavedLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** Null below one submitted claim: nothing to multiply, so nothing to show. */
export function estimatedTimeSaved(
  submittedCount: number,
  minutesPerClaim = ASSUMED_MINUTES_PER_CLAIM,
): TimeSavedEstimate | null {
  const count = Number.isFinite(submittedCount) ? Math.max(0, Math.floor(submittedCount)) : 0;
  if (count < 1) return null;
  const minutes = count * minutesPerClaim;
  return { minutes, label: timeSavedLabel(minutes), assumption: timeSavedAssumption(minutesPerClaim) };
}

export interface MembershipStart {
  createdAt?: string | null;
  trialEnd?: string | null;
}

function parseStamp(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function wholeMonthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const adjusted = to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
  return Math.max(0, adjusted);
}

/**
 * Monthly periods begun since billing started, or null when we cannot tell.
 * Zero means the member is still inside the free trial and has been billed
 * nothing. Deliberately NOT a record of payments: public.subscriptions stores
 * subscription state only, with no invoices and no amounts, so every figure
 * built on this is a list-price comparison and never "what you paid".
 */
export function monthsSubscribed(membership: MembershipStart | null, now: Date): number | null {
  if (!membership) return null;
  const start = parseStamp(membership.trialEnd) ?? parseStamp(membership.createdAt);
  if (!start) return null;
  if (start.getTime() > now.getTime()) return 0;
  return wholeMonthsBetween(start, now) + 1;
}

export interface ValueComparison {
  /**
   * What the comparison is made of. 'actual' uses amounts the member reported
   * receiving; 'potential' uses listed payout ranges, which are not money
   * received. Null means no honest comparison is available.
   */
  basis: 'actual' | 'potential' | null;
  months: number | null;
  /** The assumed membership cost, e.g. "$60". Null when the months are unknown. */
  costLabel: string | null;
  /** A multiple of the assumed cost, or null when the honest answer is a sentence. */
  multipleLabel: string | null;
  /** Printed in place of a number whenever multipleLabel is null. */
  note: string | null;
  assumption: string;
}

function multipleText(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0×';
  if (value < 10) return `${Math.round(value * 10) / 10}×`;
  return `${Math.round(value)}×`;
}

export function comparisonAssumption(
  months: number | null,
  monthlyCents = CLAIMMATCH_MEMBERSHIP_PRICE_CENTS,
): string {
  const price = membershipPriceCopy(monthlyCents);
  const basis =
    months == null
      ? `${price} a month × the months you have been subscribed`
      : `${price} a month × ${months} ${months === 1 ? 'month' : 'months'} subscribed (${formatUsd(
          (months * monthlyCents) / 100,
        )})`;
  return `${DASHBOARD_VALUE_COPY.estimateWord} Assumes ${basis}. That is the monthly list price, not an amount Lawsuit AI billed you: Lawsuit AI does not store your payment history.`;
}

/**
 * Earnings measured against the membership list price. Prefers amounts the
 * member reported receiving; falls back to the listed potential ranges and says
 * which it used, because a potential figure is not a payout received.
 */
export function valueComparison(input: {
  actualTotal: number;
  potential: OwedEstimate | null;
  months: number | null;
  monthlyCents?: number;
}): ValueComparison {
  const monthlyCents = input.monthlyCents ?? CLAIMMATCH_MEMBERSHIP_PRICE_CENTS;
  const { months } = input;
  const assumption = comparisonAssumption(months, monthlyCents);
  const cost = months == null ? null : (months * monthlyCents) / 100;
  const empty = (note: string): ValueComparison => ({
    basis: null,
    months,
    costLabel: cost == null ? null : formatUsd(cost),
    multipleLabel: null,
    note,
    assumption,
  });
  if (months == null || cost == null) return empty(DASHBOARD_VALUE_COPY.comparisonNoStart);
  if (months < 1 || cost <= 0) return empty(DASHBOARD_VALUE_COPY.comparisonInTrial);
  const costLabel = formatUsd(cost);
  const actual = Number.isFinite(input.actualTotal) ? input.actualTotal : 0;
  if (actual > 0) {
    return {
      basis: 'actual',
      months,
      costLabel,
      multipleLabel: multipleText(actual / cost),
      note: null,
      assumption,
    };
  }
  const { potential } = input;
  if (potential && potential.low > 0) {
    const low = multipleText(potential.low / cost);
    const high = multipleText(potential.high / cost);
    return {
      basis: 'potential',
      months,
      costLabel,
      multipleLabel: low === high ? low : `${low}–${high}`,
      note: null,
      assumption,
    };
  }
  return empty(DASHBOARD_VALUE_COPY.comparisonNothingToCompare);
}

export interface DashboardValue {
  potential: OwedEstimate | null;
  /** The listed range as text. Null when potential is null. */
  potentialLabel: string | null;
  payouts: ReportedPayouts;
  /** Formatted total, or null when the member reported no amount. Never "$0". */
  payoutTotalLabel: string | null;
  submittedCount: number;
  timeSaved: TimeSavedEstimate | null;
  comparison: ValueComparison;
}

export interface DashboardValueInput {
  matches: readonly MatchPayoutTerms[];
  claims: readonly SubmittedClaimFields[];
  payouts: readonly ReportedPayoutRow[];
  membership: MembershipStart | null;
  now: Date;
  monthlyCents?: number;
  minutesPerClaim?: number;
}

/**
 * Null when there is nothing honest to show: no match has a listed payout, the
 * member has reported no payout, and no claim has reached an administrator.
 */
export function buildDashboardValue(input: DashboardValueInput): DashboardValue | null {
  const potential = visibleOwedEstimate(input.matches);
  const payouts = sumReportedPayouts(input.payouts);
  const submittedCount = countSubmittedClaims(input.claims);
  if (!potential && payouts.count === 0 && submittedCount === 0) return null;
  return {
    potential,
    potentialLabel: potential ? owedRangeLabel(potential) : null,
    payouts,
    payoutTotalLabel: payouts.total > 0 ? formatUsd(payouts.total) : null,
    submittedCount,
    timeSaved: estimatedTimeSaved(submittedCount, input.minutesPerClaim),
    comparison: valueComparison({
      actualTotal: payouts.total,
      potential,
      months: monthsSubscribed(input.membership, input.now),
      monthlyCents: input.monthlyCents,
    }),
  };
}
