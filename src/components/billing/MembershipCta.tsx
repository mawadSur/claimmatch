'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { clientFunnelEnabled } from '@/lib/analytics/funnel-events';
import { withFunnelAttribution } from '@/lib/funnel';

/** Starts Stripe Checkout for the signed-in member. */
export function MembershipCta({
  returnTo,
  className = 'btn-primary mt-4 w-full sm:w-auto',
}: {
  returnTo?: string;
  className?: string;
}) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnTo ? { return_to: returnTo } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error || 'We couldn’t start checkout. Please try again.');
        setBusy(false);
        return;
      }
      if (clientFunnelEnabled()) {
        posthog?.capture(
          ANALYTICS_EVENTS.checkout_started,
          withFunnelAttribution({ source: 'membership_cta' }),
        );
      }
      window.location.href = json.url;
    } catch {
      setError('We couldn’t reach Lawsuit AI. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} onClick={start} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Starting…
          </>
        ) : (
          <>
            Continue to membership checkout
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Opens Stripe Customer Billing Portal. */
export function ManageBillingButton({
  className = 'btn-secondary',
}: {
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_to: '/settings' }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error || 'We couldn’t open billing. Please try again.');
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError('We couldn’t reach Lawsuit AI. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} onClick={open} disabled={busy}>
        {busy ? 'Opening…' : 'Manage billing'}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
