import Link from 'next/link';
import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SiteLogo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <Link
      href="/"
      className={cn(
        'flex items-center gap-2.5 rounded-lg font-sans text-[1.125rem] font-bold tracking-tight text-ink',
        'transition-colors duration-200 hover:text-brand-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        className,
      )}
    >
      <span
        className={`grid ${box} place-items-center rounded-lg bg-gradient-to-b from-brand-600 to-brand-800 text-white shadow-btn-primary`}
      >
        <Scale className={icon} aria-hidden />
      </span>
      <span>ClaimMatch</span>
    </Link>
  );
}
