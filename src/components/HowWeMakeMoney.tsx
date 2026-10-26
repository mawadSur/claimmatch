import Link from 'next/link';
import { HandCoins, CheckCircle2 } from 'lucide-react';
import { FeeDisclosure } from './FeeDisclosure';

/**
 * Approved money-disclosure copy (Mohammed, Oct 15 2026). Not legal text —
 * counsel reviews it before any fee is set.
 */
export function HowWeMakeMoney({
  heading = 'h2',
}: {
  heading?: 'h1' | 'h2';
}) {
  const Heading = heading;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-card sm:p-10">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <HandCoins className="h-5 w-5" />
        </div>
        <Heading className="text-2xl font-extrabold">How ClaimMatch makes money</Heading>
      </div>
      <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-muted">
        {[
          'Filing a settlement claim is always free on the official administrator’s site. You never need ClaimMatch to file.',
          'ClaimMatch finds settlements, checks them against your profile, and pre-fills your claim details so you can submit faster. You review and submit every claim yourself.',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <FeeDisclosure />
      </div>
      <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-muted">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
          <span>
            We don’t sell your personal information.{' '}
            <span className="text-ink-soft">(Pending counsel review.)</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
          <span>
            We don’t take money from settlement administrators or law firms to rank
            settlements.{' '}
            <span className="text-ink-soft">(Pending counsel review.)</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
          <span>If we ever add a fee or paid features, we’ll show the price before you use them.</span>
        </li>
      </ul>
      <p className="mt-6 text-xs text-ink-soft">
        Draft for review — not legal text.{' '}
        <Link href="/pricing" className="font-semibold text-brand-700 hover:text-brand-800">
          Pricing
        </Link>
      </p>
    </div>
  );
}
