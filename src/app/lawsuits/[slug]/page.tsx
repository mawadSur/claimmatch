import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  ShieldCheck,
  Clock,
  ExternalLink,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { getLawsuitBySlug } from '@/lib/lawsuits';
import { createClient } from '@/lib/supabase/server';
import { formatDeadline, daysUntil, getValidClaimUrl } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import type { LawsuitStatus } from '@/lib/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lawsuit = await getLawsuitBySlug(slug);
  if (!lawsuit) return { title: 'Settlement not found' };
  return {
    title: lawsuit.title,
    description: lawsuit.summary ?? undefined,
  };
}

const STATUS_META: Record<LawsuitStatus, { label: string; className: string }> = {
  open: { label: 'Open for claims', className: 'badge-green' },
  closing_soon: { label: 'Closing soon', className: 'badge-red' },
  closed: { label: 'Closed', className: 'badge-gray' },
  draft: { label: 'Draft', className: 'badge-gray' },
};

export default async function LawsuitDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lawsuit = await getLawsuitBySlug(slug);
  if (!lawsuit) notFound();

  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {
    signedIn = false;
  }

  const days = daysUntil(lawsuit.deadline);
  const closingSoon = days !== null && days >= 0 && days <= 30;
  const status = STATUS_META[lawsuit.status] ?? STATUS_META.open;

  const claimClosed = lawsuit.status === 'closed' || (days !== null && days < 0);
  const claimHref = signedIn
    ? `/claim/${lawsuit.slug}`
    : `/signup?next=/claim/${lawsuit.slug}`;
  const claimLabel = signedIn ? 'Start your claim' : 'Sign up to file';

  const officialClaimUrl = getValidClaimUrl(lawsuit.claim_url);
  const officialSourceUrl = getValidClaimUrl(lawsuit.source_url);
  const hasOfficialLink = !!officialClaimUrl || !!officialSourceUrl;

  return (
    <>
      {/* Header ------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-10 sm:py-14">
          <Link
            href="/lawsuits"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" /> All settlements
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="badge-brand">{lawsuit.category}</span>
            <span className={status.className}>{status.label}</span>
            {closingSoon && (
              <span className="badge-red gap-1">
                <Clock className="h-3 w-3" /> {days} day{days === 1 ? '' : 's'} left
              </span>
            )}
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl">
            {lawsuit.title}
          </h1>
          {lawsuit.summary && (
            <p className="mt-4 max-w-2xl text-lg text-ink-muted">{lawsuit.summary}</p>
          )}
        </div>
      </section>

      {/* Administrator disclaimer ------------------------------------------- */}
      <section className="container-page -mt-2 pb-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                ClaimMatch is not the settlement administrator
              </p>
              <p className="mt-1 text-sm text-amber-700">
                We help you discover and file claims, but the official settlement administrator
                processes all claims and payments.
                {officialClaimUrl && (
                  <>
                    {' '}To file directly with the administrator, visit the{' '}
                    <a
                      href={officialClaimUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline hover:text-amber-900"
                    >
                      official claim site
                    </a>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Body --------------------------------------------------------------- */}
      <section className="container-page grid gap-8 py-12 lg:grid-cols-3">
        {/* Main */}
        <div className="lg:col-span-2">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-gray-50 p-5">
            <Stat
              icon={<Wallet className="h-4 w-4" />}
              label="Typical payout"
              value={lawsuit.typical_payout || 'Varies'}
              accent
            />
            <Stat
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Proof"
              value={lawsuit.proof_required ? 'Required' : 'Not required'}
            />
            <Stat
              icon={<Clock className="h-4 w-4" />}
              label="Deadline"
              value={formatDeadline(lawsuit.deadline)}
            />
          </div>

          {lawsuit.description && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">About this settlement</h2>
              <p className="mt-3 leading-relaxed text-ink-muted">
                {lawsuit.description}
              </p>
            </div>
          )}

          {lawsuit.eligibility_text && (
            <div className="mt-8 rounded-2xl border border-success-500/20 bg-success-50/60 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <UserCheck className="h-5 w-5 text-success-600" /> Who qualifies
              </h2>
              <p className="mt-2 leading-relaxed text-ink-muted">
                {lawsuit.eligibility_text}
              </p>
            </div>
          )}

          {hasOfficialLink && (
            <div className="mt-8">
              <h2 className="text-lg font-bold">Official sources</h2>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {officialClaimUrl && (
                  <a
                    href={officialClaimUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    <ExternalLink className="h-4 w-4" /> Official claim site
                  </a>
                )}
                {officialSourceUrl && (
                  <a
                    href={officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                  >
                    <ExternalLink className="h-4 w-4" /> Settlement notice
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="mt-10">
            <Disclaimer />
          </div>
        </div>

        {/* Sidebar CTA */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border-t-4 border-brand-400 bg-white p-6 shadow-card">
            <h3 className="text-lg font-bold">
              {claimClosed ? 'This settlement has closed' : 'Think this is you?'}
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              {claimClosed
                ? 'The filing window for this settlement has passed. Browse open settlements you may still qualify for.'
                : 'We’ll pre-fill the official claim details from your profile so you can file in minutes.'}
            </p>
            {claimClosed ? (
              <Link href="/lawsuits" className="btn-secondary mt-5 w-full justify-center">
                Browse open settlements <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link href={claimHref} className="btn-primary mt-5 w-full justify-center">
                  {claimLabel} <ArrowRight className="h-4 w-4" />
                </Link>
                {!signedIn && (
                  <p className="mt-3 text-center text-xs text-ink-soft">
                    Free to start · No win, no fee
                  </p>
                )}
              </>
            )}
            <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5">
              {[
                'Guided, pre-filled claim form',
                'A receipt number saved to your dashboard',
                ...(officialClaimUrl ? ['A link straight to the official claim site'] : []),
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-2 text-sm text-ink-muted"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />{' '}
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {icon} {label}
      </div>
      <div
        className={`mt-1 truncate text-sm font-bold ${
          accent ? 'text-success-600' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
