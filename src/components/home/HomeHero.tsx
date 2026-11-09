import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ExternalLink, HandCoins } from 'lucide-react';
import type { HomeStats } from '@/lib/home-stats';
import { CLOSING_SOON_DAYS, formatUpdated } from '@/lib/home-stats';
import { BrowserFrame, PhoneFrame, type Screen } from './DeviceFrame';
import { CountUp } from './CountUp';

/**
 * Home hero: headline and calls to action on the left, the real app on the
 * right. The desktop shot leans back and lies flat as the page scrolls; the
 * phone drifts a little faster for depth (CSS scroll timelines, see
 * globals.css). Below sits a strip of live counts from the open catalog.
 */
export function HomeHero({
  primary,
  extra,
  freeLabel,
  browseNote,
  stats,
  desktop,
  phone,
  mobile,
}: {
  primary: { href: string; label: string };
  extra?: ReactNode;
  freeLabel: string;
  browseNote?: string;
  stats: HomeStats | null;
  desktop: Screen;
  phone: Screen;
  mobile: Screen;
}) {
  const updated = stats ? formatUpdated(stats.updatedAt) : null;

  return (
    <section className="relative isolate overflow-hidden bg-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-brand-50 via-white to-white" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] bg-grid" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-24 -z-10 h-[34rem] w-[34rem] rounded-full bg-brand-200/40 blur-[110px]"
      />

      <div className="container-page pb-16 pt-12 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-12">
          <div className="stagger max-w-xl">
            <p
              style={{ '--i': 0 } as CSSProperties}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200"
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
              </span>
              {stats ? 'Live catalog' : freeLabel}
              {stats && updated && (
                <span className="font-normal text-ink-muted">· refreshed {updated}</span>
              )}
            </p>

            <h1
              style={{ '--i': 1 } as CSSProperties}
              className="mt-6 text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-[4.25rem]"
            >
              Find settlement money{' '}
              <span className="italic text-brand-600">that may be yours.</span>
            </h1>

            <p
              style={{ '--i': 2 } as CSSProperties}
              className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted sm:text-xl"
            >
              Check open class-action settlements, read who qualifies on the official
              notice, file on the official site, and keep track of every claim here.
            </p>
            {browseNote && (
              <p
                style={{ '--i': 2 } as CSSProperties}
                className="mt-3 max-w-lg text-sm leading-relaxed text-ink-muted"
              >
                {browseNote}
              </p>
            )}

            <div
              style={{ '--i': 3 } as CSSProperties}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
            >
              <Link href={primary.href} className="btn-primary px-6 text-base">
                {primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="#how-it-works" className="btn-secondary px-6 text-base">
                How it works
              </Link>
              {extra}
            </div>

            <ul
              style={{ '--i': 4 } as CSSProperties}
              className="mt-8 flex flex-col gap-2.5 text-sm font-medium text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-6"
            >
              {[
                { icon: CheckCircle2, text: freeLabel },
                { icon: HandCoins, text: 'We never handle settlement payments' },
                { icon: ExternalLink, text: 'You file on the official site' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-success-600" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
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

            <div className="relative mx-auto max-w-[17rem] lg:hidden">
              <div
                aria-hidden
                className="absolute -inset-8 -z-10 rounded-full bg-brand-100/70 blur-2xl"
              />
              <div className="relative max-h-[27rem] overflow-hidden rounded-t-[2.75rem]">
                <PhoneFrame screen={mobile} priority sizes="17rem" />
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
