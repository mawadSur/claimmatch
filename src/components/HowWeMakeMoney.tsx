import Link from 'next/link';
import { HandCoins, CheckCircle2 } from 'lucide-react';
import { FeeDisclosure } from './FeeDisclosure';

/**
 * Public money-disclosure copy. Monetization is undecided (D4).
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
          'ClaimMatch lists open settlements and gives you copy-ready details (name, email, phone, address, and state you saved) to paste into the official form. You review and file every claim yourself. ClaimMatch never files for you.',
          'ClaimMatch is free during beta. We don’t run ads or sell paid plans today.',
          'We don’t sell your personal information.',
          'We don’t take money from settlement administrators or law firms to rank settlements.',
          'We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.',
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
      <p className="mt-6 text-xs text-ink-soft">
        <Link href="/pricing" className="font-semibold text-brand-700 hover:text-brand-800">
          Pricing
        </Link>
      </p>
    </div>
  );
}
