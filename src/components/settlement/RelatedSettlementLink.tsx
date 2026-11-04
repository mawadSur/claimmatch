'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { withFunnelAttribution } from '@/lib/funnel';

export function RelatedSettlementLink({
  href,
  fromSlug,
  toSlug,
  className,
  children,
}: {
  href: string;
  fromSlug: string;
  toSlug: string;
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
          'related_settlement_clicked',
          withFunnelAttribution({ from_slug: fromSlug, slug: toSlug }),
        );
      }}
    >
      {children}
    </Link>
  );
}
