import Link from 'next/link';
import { Building2, ExternalLink, HandCoins, Lock, Mail, Scale, ShieldCheck } from 'lucide-react';
import {
  FILE_FREE_DIRECTLY,
  NEVER_CHARGE_UPFRONT,
  NO_SSN_OR_BANK_TO_MATCH,
  OPERATOR_LEGAL_NAME,
  PUBLIC_CONTACT_EMAIL,
  operatorLine,
} from '@/lib/copy';
import { howWeMakeMoneyFact, trustFactsCheckedLabel } from '@/lib/trust-facts';
import { flags } from '@/lib/flags';
import { legalContact } from '@/lib/legal-contact';
import { cn } from '@/lib/utils';

/**
 * Compact, checkable trust facts. Shown on home, settlement pages, and signup.
 * Fee copy stays behind FEE_DISCLOSURE_ENABLED (howWeMakeMoneyFact).
 */
export function PublicTrustBlock({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const contact = legalContact();
  const email = contact.email || PUBLIC_CONTACT_EMAIL;
  const entity = contact.legalEntity || OPERATOR_LEGAL_NAME;
  const disclose = flags.feeDisclosure();
  const checked = trustFactsCheckedLabel();
  const points = [
    { icon: Building2, text: operatorLine(entity) },
    {
      icon: HandCoins,
      text: disclose ? `${NEVER_CHARGE_UPFRONT} ${howWeMakeMoneyFact(true)}` : howWeMakeMoneyFact(false),
    },
    { icon: ExternalLink, text: FILE_FREE_DIRECTLY },
    { icon: Scale, text: NO_SSN_OR_BANK_TO_MATCH },
    {
      icon: Lock,
      text: 'We store your name and email to sign in, plus the state and answers you give to match settlements. We don’t sell your personal information.',
    },
  ] as const;

  return (
    <aside
      className={cn(
        'rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6',
        className,
      )}
      aria-labelledby="public-trust-heading"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 id="public-trust-heading" className="text-lg font-bold">
            Is Lawsuit AI legit?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Checkable facts about who runs this site, what it costs, and what we
            never collect to match settlements.
          </p>
        </div>
      </div>
      <ul className={cn('mt-5 space-y-3', compact && 'text-sm')}>
        {points.map(({ icon: Icon, text }) => (
          <li key={text.slice(0, 48)} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Every settlement listing links to its official administrator site when we
        have that URL.{' '}
        <Link href="/privacy" className="text-link">
          How we handle your data
        </Link>
        {' · '}
        <Link href="/how-we-make-money" className="text-link">
          How we make money
        </Link>
        {' · '}
        <Link href="/trust" className="text-link">
          More facts
        </Link>
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-4 w-4 text-brand-700" aria-hidden />
          <a href={`mailto:${email}`} className="text-link">
            {email}
          </a>
        </span>
        {checked ? <span>{checked}</span> : null}
      </p>
    </aside>
  );
}
