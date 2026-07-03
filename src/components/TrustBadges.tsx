import {
  BadgeCheck, HandCoins, Link2, Lock, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Server-safe presentational row of trust signals. Used on the trust and
 * pricing marketing pages to reassure would-be users at a glance.
 */
const BADGES = [
  { icon: BadgeCheck, label: 'Free to check' },
  { icon: HandCoins, label: 'No win, no fee' },
  { icon: Link2, label: 'Official sources linked' },
  { icon: Lock, label: 'Bank-level security' },
  { icon: XCircle, label: 'Cancel anytime' },
] as const;

export function TrustBadges({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-3',
        className,
      )}
    >
      {BADGES.map((b) => (
        <li
          key={b.label}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm"
        >
          <b.icon className="h-4 w-4 shrink-0 text-brand-600" />
          {b.label}
        </li>
      ))}
    </ul>
  );
}
