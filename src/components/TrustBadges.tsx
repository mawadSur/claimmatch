import { BadgeCheck, HandCoins, ExternalLink, Scale } from 'lucide-react';
import { flags } from '@/lib/flags';
import { cn } from '@/lib/utils';

/**
 * Server-safe row of trust facts, used on the trust and pricing pages. Every
 * badge must stay literally true; add one only when the product does it.
 */
export function TrustBadges({ className }: { className?: string }) {
  const badges = [
    {
      icon: BadgeCheck,
      label: flags.feeDisclosure() ? 'Official filing stays free' : 'Free during beta',
    },
    { icon: HandCoins, label: 'We never handle settlement payments' },
    { icon: ExternalLink, label: 'You file on the official site' },
    { icon: Scale, label: 'Not a law firm' },
  ] as const;

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-3',
        className,
      )}
    >
      {badges.map((b) => (
        <li
          key={b.label}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm"
        >
          <b.icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          {b.label}
        </li>
      ))}
    </ul>
  );
}
