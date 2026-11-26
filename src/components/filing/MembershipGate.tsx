'use client';

import { MembershipCta } from '@/components/billing/MembershipCta';
import { membershipCopy } from '@/lib/copy';

/** Easy submit start CTA when membership is required and the member is not subscribed. */
export function MembershipGate({ returnTo }: { returnTo: string }) {
  return (
    <section
      id="one-click"
      aria-labelledby="membership-gate-title"
      className="scroll-mt-24 rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-card sm:p-6"
    >
      <h2 id="membership-gate-title" className="text-lg font-bold">
        Easy submit is included with membership
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink">{membershipCopy()}</p>
      <MembershipCta returnTo={returnTo} />
      <p className="mt-4 border-t border-brand-100 pt-3 text-sm leading-relaxed text-ink-muted">
        You can still file on the official settlement site yourself, where filing is free.
      </p>
    </section>
  );
}
