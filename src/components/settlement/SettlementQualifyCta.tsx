'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { withFunnelAttribution } from '@/lib/funnel';

/** Existing qualify CTA with a click event. No PII. */
export function SettlementQualifyCta({
  href,
  slug,
  lawsuitId,
  className,
  children,
}: {
  href: string;
  slug: string;
  lawsuitId: string;
  className?: string;
  children: ReactNode;
}) {
  const posthog = usePostHog();

  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        posthog?.capture(
          'settlement_cta_clicked',
          withFunnelAttribution({ lawsuit_id: lawsuitId, slug }),
        );
      }}
    >
      {children}
    </Link>
  );
}
