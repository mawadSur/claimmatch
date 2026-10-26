'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface ClaimErrorState {
  message: string;
  status?: number;
}

/** An error from a claim request. A lost session gets a link back to this page. */
export function ClaimError({ error, className }: { error: ClaimErrorState | null; className?: string }) {
  const pathname = usePathname();
  if (!error) return null;
  return (
    <p role="alert" className={cn('text-sm font-medium text-danger-700', className)}>
      {error.message}
      {error.status === 401 && (
        <>
          {' '}
          <Link
            href={`/login?next=${encodeURIComponent(pathname || '/dashboard')}`}
            className="font-semibold underline underline-offset-2"
          >
            Log in again
          </Link>
        </>
      )}
    </p>
  );
}
