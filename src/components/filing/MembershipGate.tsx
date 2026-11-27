'use client';

import { MembershipCta } from '@/components/billing/MembershipCta';
import { listedPayoutBesidePriceCopy, membershipCopy } from '@/lib/copy';

/**
 * Easy submit start CTA when membership is required and the member is not subscribed.
 *
 * `payoutLabel` is the settlement listing's own stated payout range, already
 * formatted by `statedPayoutLabel`. When it is null the gate renders exactly as
 * it did before: no placeholder, no "not stated", no invented figure.
 */
export function MembershipGate({
  returnTo,
  payoutLabel = null,
}: {
  returnTo: string;
  payoutLabel?: string | null;
}) {
  return (
    <section
      id="one-click"
      aria-labelledby="membership-gate-title"
      className="scroll-mt-24 rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-card sm:p-6"
    >
      <h2 id="membership-gate-title" className="text-lg font-bold">
        Easy submit is included with membership
      </h2>
      {payoutLabel ? (
        <p className="mt-2 text-sm leading-relaxed font-semibold text-ink">
          {listedPayoutBesidePriceCopy(payoutLabel)}
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-relaxed text-ink">{membershipCopy()}</p>
      <MembershipCta returnTo={returnTo} />
      <p className="mt-4 border-t border-brand-100 pt-3 text-sm leading-relaxed text-ink-muted">
        You can still file on the official settlement site yourself, where filing is free.
      </p>
    </section>
  );
}
