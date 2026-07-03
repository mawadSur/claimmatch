import { CheckCircle2, FileText, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { Claim, Match } from '@/lib/types';
import { estimateTotalOwed, formatUSD } from '@/lib/recovery';

/**
 * The "You're owed $X" hero — the emotional centerpiece of the dashboard.
 * Server-safe (no hooks). Sums the estimated gross across the user's active
 * matches into one big, celebratory number, with supporting stat chips for
 * open matches, active claims, and money already recovered (net, after our fee).
 */
export function MoneyHero({
  openMatches: openMatchList,
  claims,
}: {
  /** Matches the user has NOT filed a claim on yet — the "still on the table" set. */
  openMatches: Match[];
  claims: Claim[];
}) {
  const totalOwed = estimateTotalOwed(openMatchList);
  const openMatches = openMatchList.length;
  const activeClaims = claims.filter(
    (c) => c.status !== 'rejected' && c.status !== 'paid',
  ).length;
  const totalRecovered = claims.reduce(
    (sum, c) =>
      c.recovery && c.recovery.status === 'paid'
        ? sum + (c.recovery.net_amount ?? 0)
        : sum,
    0,
  );

  const hasMoney = totalOwed > 0;

  return (
    <section className="reveal overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 p-7 text-white shadow-card-hover sm:p-10">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-inset ring-white/20">
        <Sparkles className="h-3.5 w-3.5" /> Estimated total you’re owed
      </span>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="font-display text-5xl font-extrabold leading-none tracking-tight sm:text-7xl">
          {formatUSD(totalOwed)}
        </span>
        {hasMoney && (
          <span className="inline-flex items-center gap-1 pb-1 text-sm font-semibold text-white/80">
            <TrendingUp className="h-4 w-4" />
            across {openMatches} {openMatches === 1 ? 'settlement' : 'settlements'}
          </span>
        )}
      </div>

      <p className="mt-3 max-w-xl text-sm text-white/85">
        {hasMoney
          ? 'This is our estimate of what you could recover across the settlements you match. We file on your behalf and only take our fee when you get paid.'
          : 'Finish your profile and we’ll surface the settlements you qualify for — then file every one of them for you.'}
      </p>

      {/* Stat chips ---------------------------------------------------------- */}
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Chip
          icon={<Target className="h-5 w-5" />}
          value={String(openMatches)}
          label={openMatches === 1 ? 'Open match' : 'Open matches'}
        />
        <Chip
          icon={<FileText className="h-5 w-5" />}
          value={String(activeClaims)}
          label={activeClaims === 1 ? 'Active claim' : 'Active claims'}
        />
        <Chip
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={formatUSD(totalRecovered)}
          label="Recovered for you"
          highlight
        />
      </div>
    </section>
  );
}

function Chip({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          highlight ? 'bg-success-500/40 text-white' : 'bg-white/15 text-white'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xl font-extrabold text-white">{value}</div>
        <div className="text-xs font-medium text-white/70">{label}</div>
      </div>
    </div>
  );
}
