'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { inviteSignupHref } from '@/lib/soft-invite';

export function InviteSignupCta() {
  const searchParams = useSearchParams();
  const href = inviteSignupHref(searchParams);

  return (
    <Link href={href} className="btn-primary w-full sm:w-auto">
      Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
