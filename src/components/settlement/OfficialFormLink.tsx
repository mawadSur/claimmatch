'use client';

import type { ReactNode } from 'react';
import { usePostHog } from 'posthog-js/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { clientDidYouFileEnabled, clientFunnelEnabled } from '@/lib/analytics/funnel-events';
import { withFunnelAttribution } from '@/lib/funnel';

/**
 * Public official-form link. Captures intent, never a filing.
 * Used signed-out on settlement pages and anywhere else the catalog
 * already has an official URL.
 */
export function OfficialFormLink({
  href,
  lawsuitId,
  slug,
  className,
  children,
}: {
  href: string;
  lawsuitId: string;
  slug: string;
  className?: string;
  children: ReactNode;
}) {
  const posthog = usePostHog();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        const extra = clientFunnelEnabled()
          ? { settlement_slug: slug, lawsuit_id: lawsuitId, slug, intent: 'official_form', is_filing: false, source: 'settlement_page' }
          : { lawsuit_id: lawsuitId, slug, intent: 'official_form', is_filing: false, source: 'settlement_page' };
        posthog?.capture(ANALYTICS_EVENTS.official_form_opened, withFunnelAttribution(extra));
        if (clientDidYouFileEnabled()) {
          void fetch('/api/official-form-opens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lawsuit_id: lawsuitId }),
          }).catch(() => {});
        }
      }}
    >
      {children}
    </a>
  );
}
