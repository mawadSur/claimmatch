import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ExternalLink, HandCoins } from 'lucide-react';
import type { HomeStats } from '@/lib/home-stats';
import { CLOSING_SOON_DAYS, formatCount, formatUpdated } from '@/lib/home-stats';
import { formatOwedUsd } from '@/lib/owed-estimate';
import {
  HOME_HERO_FREE_LINE,
  HOME_HERO_HEADLINE_EMPHASIS,
  HOME_HERO_HEADLINE_LEAD,
  HOME_HERO_PAYMENT_CLARITY,
  HOME_HERO_PAYOUT_NOTE,
  HOME_HERO_SUBHEAD,
  heroClosingLine,
  heroPayoutHeadline,
  heroPayoutSource,
  heroPayoutSupport,
  homeHeroPriceLine,
} from '@/lib/copy';
import { BrowserFrame, PhoneFrame, type Screen } from './DeviceFrame';
import { CountUp } from './CountUp';
import { HeroMotion } from './HeroMotion';

/**
 * Figures for the hero, counted from the catalog by the caller. Every field is
 * nullable on purpose: a figure the caller could not compute honestly is
 * passed as null and its line is not rendered at all. Nothing here is a
 * prediction, an average across settlements, or an amount anyone will receive.
 */
export interface HeroPayout {
  /** Median of the per-person amounts the open listings state, in dollars. */
  median: number | null;
  /** The highest per-person amount a single open listing states, in dollars. */
  max: number | null;
  /** The listing that states `max`, so the figure can be checked. */
  maxTitle: string | null;
  /** That listing's slug, for the link. Omitted: the title shows as plain text. */
  maxSlug?: string | null;
  /** Open settlements counted. */
  openCount: number;
  /** Of those, how many close inside the current calendar month. */
  closingCount: number;
}

/**
 * Home hero. Above the fold, in this order: what the catalog is, the highest
 * per-person amount an open listing states (named and linked, so it is
 * checkable), real deadline scarcity, one call to action, the price, and who
 * actually pays. The real app screens sit beside it on desktop and below it on
 * a phone.
 *
 * The payout lines appear only when the caller computed their figure. There is
 * exactly one `btn-primary` here; browsing and how-it-works are text links.
 */
export function HomeHero({
  primary,
  browse,
  freeLabel,
  fileLine = 'You file on the official site',
  browseNote,
  payout,
  stats,
  desktop,
  phone,
  mobile,
  priceLine,
}: {
  primary: { href: string; label: string };
  browse: { href: string; label: string };
  freeLabel: string;
  fileLine?: string;
  browseNote?: string;
  payout?: HeroPayout | null;
  stats: HomeStats | null;
  desktop: Screen;
  phone: Screen;
  mobile: Screen;
  /** Required: the caller knows whether Easy submit may be advertised. */
  priceLine: string;
}) {
  const updated = stats ? formatUpdated(stats.updatedAt) : null;

  // One formatted line per figure the caller actually has. No figure, no line.
  const maxLabel = payout && payout.max !== null ? formatOwedUsd(payout.max) : null;
  const support = payout
    ? heroPayoutSupport({
        medianLabel: payout.median !== null ? formatOwedUsd(payout.median) : null,
        openLabel: payout.openCount > 0 ? formatCount(payout.openCount) : null,
      })
    : null;
  const closing = payout && payout.closingCount > 0 ? payout.closingCount : null;

  return (
    <section id="home-hero" className="relative isolate overflow-hidden bg-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-brand-50 via-white to-white" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] bg-grid" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-24 -z-10 h-[34rem] w-[34rem] rounded-full bg-brand-200/40 blur-[110px]"
      />

      <div className="container-page pb-14 pt-8 sm:pt-14 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-12">
          <div className="min-w-0 max-w-xl">
            <div data-hero-reveal className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
                </span>
                {stats ? 'Live catalog' : freeLabel}
                {stats && updated && (
                  <span className="font-normal text-ink-muted">· refreshed {updated}</span>
                )}
              </p>
              {closing !== null && (
                <p className="badge-gold inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                  {heroClosingLine(closing)}
                </p>
              )}
            </div>

            <h1
              data-hero-reveal
              className="mt-5 text-[2.125rem] font-medium leading-[1.06] sm:text-5xl lg:text-[4rem]"
            >
              {HOME_HERO_HEADLINE_LEAD}{' '}
              <span className="italic text-brand-600">{HOME_HERO_HEADLINE_EMPHASIS}</span>
            </h1>

            {maxLabel && (
              <div
                data-hero-reveal
                className="mt-5 rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 sm:p-5"
              >
                <p className="text-base font-semibold leading-snug text-ink sm:text-lg">
                  {heroPayoutHeadline(maxLabel)}
                </p>
                {payout?.maxTitle && (
                  <p className="mt-1 text-sm leading-snug text-ink-muted">
                    {payout.maxSlug ? (
                      <Link href={`/lawsuits/${payout.maxSlug}`} className="text-link">
                        {heroPayoutSource(payout.maxTitle)}
                      </Link>
                    ) : (
                      heroPayoutSource(payout.maxTitle)
                    )}
                  </p>
                )}
                {support && (
                  <p className="mt-2 text-[0.8125rem] font-medium leading-snug text-ink-muted">
                    {support}
                  </p>
                )}
                <p className="mt-2 text-[0.8125rem] leading-snug text-ink-muted">
                  {HOME_HERO_PAYOUT_NOTE}
                </p>
              </div>
            )}

            <div data-hero-reveal className="mt-6 flex min-w-0 flex-col gap-3">
              <Link
                data-hero-cta
                href={primary.href}
                className="btn-primary w-full px-6 text-base sm:w-auto sm:self-start"
              >
                {primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
                <Link href={browse.href} className="text-link inline-flex min-h-tap items-center">
                  {browse.label}
                </Link>
                <Link href="#how-it-works" className="text-link inline-flex min-h-tap items-center">
                  How it works
                </Link>
              </p>
            </div>

            <p data-hero-reveal className="mt-3 max-w-lg text-base leading-relaxed text-ink-muted">
              <span className="font-semibold text-ink">{HOME_HERO_FREE_LINE}</span> {priceLine}
            </p>

            <p data-hero-reveal className="mt-3 max-w-lg text-base leading-relaxed text-ink-muted">
              {HOME_HERO_PAYMENT_CLARITY}
            </p>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-muted">
              {HOME_HERO_SUBHEAD} {fileLine}.
            </p>

            <ul className="mt-6 flex flex-col gap-2.5 text-sm font-medium text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
              {[
                { icon: CheckCircle2, text: freeLabel },
                { icon: HandCoins, text: 'We never handle settlement payments' },
                { icon: ExternalLink, text: fileLine },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-success-600" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>

            {browseNote && (
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{browseNote}</p>
            )}
          </div>

          {/* Product: desktop composition on large screens, a phone below that. */}
          <div className="relative">
            <div className="relative mx-auto hidden max-w-[44rem] lg:block lg:pb-10 lg:pl-10">
              <div data-tilt>
                <BrowserFrame screen={desktop} path="/lawsuits" priority sizes="(min-width: 1280px) 42rem, 52vw" />
              </div>
              <div
                data-drift
                style={{ '--drift': '-96px' } as CSSProperties}
                className="absolute -bottom-6 -left-4 z-10 w-[31%] max-w-[12.5rem]"
              >
                <PhoneFrame screen={phone} sizes="12.5rem" />
              </div>
            </div>

            {/* Below the fold on a phone, so it loads lazily and never delays the CTA. */}
            <div className="relative mx-auto max-w-[17rem] lg:hidden">
              <div
                aria-hidden
                className="absolute -inset-8 -z-10 rounded-full bg-brand-100/70 blur-2xl"
              />
              <div className="relative max-h-[27rem] overflow-hidden rounded-t-[2.75rem]">
                <PhoneFrame screen={mobile} sizes="17rem" />
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
              </div>
            </div>
          </div>
        </div>

        {stats && stats.open > 0 && (
          <div className="mt-16 border-t border-slate-200 pt-10 lg:mt-20">
            <p className="text-sm font-semibold text-ink-muted">
              Live from the catalog{updated ? `, refreshed ${updated}` : ''}
            </p>
            <dl className={`mt-6 grid grid-cols-2 gap-x-6 gap-y-8 ${LG_COLS[liveStats(stats).length + 1] ?? 'lg:grid-cols-4'}`}>
              {liveStats(stats).map((s) => (
                <Stat key={s.label} value={s.value} label={s.label} />
              ))}
              <div className="border-l border-slate-200 pl-5">
                <dt className="sr-only">Cost to file on the official site</dt>
                <dd className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">$0</dd>
                <dd className="mt-2 text-sm leading-snug text-ink-muted">to file on the official site</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <HeroMotion rootId="home-hero" />
    </section>
  );
}

const LG_COLS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

/** Counts worth showing: the open total always, the others only when non-zero. */
function liveStats(stats: HomeStats): { value: number; label: string }[] {
  return [
    { value: stats.open, label: 'open settlements taking claims' },
    { value: stats.closingSoon, label: `close in the next ${CLOSING_SOON_DAYS} days` },
    { value: stats.noProof, label: 'need no proof, per the listing' },
  ].filter((s, i) => i === 0 || s.value > 0);
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-l border-slate-200 pl-5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
        <CountUp value={value} />
      </dd>
      <dd className="mt-2 text-sm leading-snug text-ink-muted" aria-hidden>
        {label}
      </dd>
    </div>
  );
}
