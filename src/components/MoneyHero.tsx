import type { CSSProperties, ReactNode } from 'react';
import { CheckCircle2, FileText, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { Claim, Match } from '@/lib/types';
import { estimateTotalOwed, formatUSD } from '@/lib/recovery';
import { CountUp } from './CountUp';

/** Subtle film grain (inline SVG feTurbulence) for depth over the flat gradient. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * The "You're owed $X" hero — the emotional centerpiece of the dashboard.
 * Server-safe: the only client bit is <CountUp>, which animates the headline
 * figure up on mount. Sums the estimated gross across the user's active matches
 * into one big, celebratory number, with supporting stat chips for open
 * matches, active claims, and money already recovered (net, after our fee).
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
    <section className="reveal relative isolate overflow-hidden rounded-3xl bg-brand-700 p-7 text-white shadow-card-hover sm:p-10">
      {/* Layered depth — base diagonal gradient + soft radial glows + grain.
          Purely decorative; content sits above via z-index / relative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 -z-10 h-80 w-80 rounded-full bg-brand-400/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-10 -z-10 h-96 w-96 rounded-full bg-success-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '140px 140px' }}
      />

      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-inset ring-white/20">
        <Sparkles className="h-3.5 w-3.5" /> Estimated total you&rsquo;re owed
      </span>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <CountUp
          value={totalOwed}
          format={formatUSD}
          className="font-display text-5xl font-extrabold leading-none tracking-tight tabular-nums money-sheen sm:text-7xl"
        />
        {hasMoney && (
          <span className="inline-flex items-center gap-1 pb-1 text-sm font-semibold text-white/80">
            <TrendingUp className="h-4 w-4" />
            across{' '}
            <span className="tabular-nums">{openMatches}</span>{' '}
            {openMatches === 1 ? 'settlement' : 'settlements'}
          </span>
        )}
      </div>

      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85">
        {hasMoney
          ? 'This is our estimate of what you could recover across the settlements you match. Authorize with one e-signature and we file with the official administrators — you only pay our fee when you get paid.'
          : "Finish your profile and we'll surface the settlements you qualify for — then help you file with the official administrators."}
      </p>

      {/* Stat chips — staggered reveal on page load. --------------------------- */}
      <div className="stagger mt-7 grid gap-3 sm:grid-cols-3">
        <Chip
          index={0}
          icon={<Target className="h-5 w-5" />}
          value={String(openMatches)}
          label={openMatches === 1 ? 'Open match' : 'Open matches'}
        />
        <Chip
          index={1}
          icon={<FileText className="h-5 w-5" />}
          value={String(activeClaims)}
          label={activeClaims === 1 ? 'Active claim' : 'Active claims'}
        />
        <Chip
          index={2}
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
  index,
  icon,
  value,
  label,
  highlight,
}: {
  index: number;
  icon: ReactNode;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{ '--i': index } as CSSProperties}
      className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm"
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          highlight
            ? 'bg-success-500/40 text-white ring-1 ring-inset ring-success-100/30'
            : 'bg-white/15 text-white'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xl font-extrabold tabular-nums text-white">
          {value}
        </div>
        <div className="text-xs font-medium text-white/70">{label}</div>
      </div>
    </div>
  );
}
