import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Building2, HandCoins, ShieldCheck } from 'lucide-react';
import type { HomeStats } from '@/lib/home-stats';
import { formatUpdated } from '@/lib/home-stats';

import {
  HOME_HERO_HEADLINE_EMPHASIS,
  HOME_HERO_HEADLINE_LEAD,
  HOME_HERO_SUBLINE,
  OPERATOR_LEGAL_NAME,
} from '@/lib/copy';
import { BrowserFrame, PhoneFrame, type Screen } from './DeviceFrame';
import { HeroMotion } from './HeroMotion';

/**
 * Compact home hero: one headline, one short subline, one primary CTA, one
 * secondary link, and at most three trust chips. Product screens stay beside
 * the copy on desktop and below it on a phone.
 */
export function HomeHero({
  primary,
  browse,
  stats,
  desktop,
  mobile,
}: {
  primary: { href: string; label: string };
  browse: { href: string; label: string };
  stats: HomeStats | null;
  desktop: Screen;
  mobile: Screen;
}) {
  const updated = stats ? formatUpdated(stats.updatedAt) : null;

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
          <div className="stagger min-w-0 max-w-xl">
            <div style={{ '--i': 0 } as CSSProperties} className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
                </span>
                {stats ? 'Live catalog' : 'Open settlements'}
                {stats && updated && (
                  <span className="font-normal text-ink-muted">· refreshed {updated}</span>
                )}
              </p>
            </div>

            <h1
              style={{ '--i': 1 } as CSSProperties}
              className="mt-5 text-[2.125rem] font-medium leading-[1.06] sm:text-5xl lg:text-[4rem]"
            >
              {HOME_HERO_HEADLINE_LEAD}{' '}
              <span className="italic text-brand-600">{HOME_HERO_HEADLINE_EMPHASIS}</span>
            </h1>

            <p
              style={{ '--i': 2 } as CSSProperties}
              className="mt-4 max-w-lg text-lg leading-relaxed text-ink-muted"
            >
              {HOME_HERO_SUBLINE}
            </p>

            <div style={{ '--i': 3 } as CSSProperties} className="mt-7 flex min-w-0 flex-col gap-3">
              <Link
                data-hero-cta
                href={primary.href}
                className="btn-primary w-full px-6 text-base sm:w-auto sm:self-start"
              >
                {primary.label}
              </Link>
              <Link href={browse.href} className="text-link inline-flex min-h-tap items-center sm:self-start">
                {browse.label}
              </Link>
            </div>

            <ul className="mt-8 flex flex-col gap-2.5 text-sm font-medium text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
              {[
                { icon: Building2, text: `${OPERATOR_LEGAL_NAME} · not a law firm` },
                { icon: ShieldCheck, text: 'Free to match · no card' },
                { icon: HandCoins, text: 'We never touch your payout' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-success-600" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="relative mx-auto hidden max-w-[44rem] lg:block">
              <div data-tilt>
                <BrowserFrame screen={desktop} path="/lawsuits" priority sizes="(min-width: 1280px) 42rem, 52vw" />
              </div>
            </div>

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
      </div>

      <HeroMotion rootId="home-hero" />
    </section>
  );
}
