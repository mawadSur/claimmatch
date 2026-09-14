import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, Mail, FileText, Sparkles, CheckCircle2,
  Bell, Wallet, Lock,
} from 'lucide-react';
import { getLawsuits } from '@/lib/lawsuits';
import { FEE_PCT } from '@/lib/recovery';
import { LawsuitCard } from '@/components/LawsuitCard';
import { EmailCapture } from '@/components/EmailCapture';

/**
 * Very subtle film-grain noise as an inline SVG data URI — layered over the hero
 * so the brand glow reads as depth, not a flat purple gradient.
 */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const FEE_LABEL = `${Math.round(FEE_PCT * 100)}%`;

export default async function HomePage() {
  const featured = await getLawsuits({ featured: true, limit: 3 });

  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-white">
        {/* Layered background: base wash + two soft radial glows + faint grain */}
        <div className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-brand-50 via-white to-white" />
        <div className="pointer-events-none absolute -right-32 -top-40 -z-20 h-[36rem] w-[36rem] rounded-full bg-brand-300/40 blur-[100px]" />
        <div className="pointer-events-none absolute -left-40 top-1/3 -z-20 h-[30rem] w-[30rem] rounded-full bg-brand-200/50 blur-[110px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: NOISE }}
        />

        <div className="container-page relative py-20 sm:py-24 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            {/* Left: copy ---------------------------------------------------- */}
            <div className="stagger max-w-xl text-center lg:text-left">
              <span
                style={{ '--i': 0 } as CSSProperties}
                className="badge-brand mx-auto gap-1.5 ring-1 ring-inset ring-brand-200/70 lg:mx-0"
              >
                <Sparkles className="h-3.5 w-3.5" /> Free to check · No win, no fee
              </span>

              <h1
                style={{ '--i': 1 } as CSSProperties}
                className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.1rem]"
              >
                Find the settlement money{' '}
                <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
                  you’re owed.
                </span>
              </h1>

              <p
                style={{ '--i': 2 } as CSSProperties}
                className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted lg:mx-0"
              >
                Billions in class-action settlements go unclaimed every year. ClaimMatch
                finds the ones you qualify for, files the claim for you, and only takes a
                fee when the money actually lands.
              </p>

              <div
                style={{ '--i': 3 } as CSSProperties}
                className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
              >
                <Link href="/signup" className="btn-primary w-full sm:w-auto">
                  Find my settlements <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
                  <Search className="h-4 w-4" /> Browse all settlements
                </Link>
              </div>

              <p
                style={{ '--i': 4 } as CSSProperties}
                className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-soft lg:justify-start"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-500" /> Takes 2 minutes to check
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success-500" /> You only pay if you get paid
                </span>
              </p>
            </div>

            {/* Right: product video in a device frame + notification flourish */}
            <div className="stagger">
              <div
                style={{ '--i': 5 } as CSSProperties}
                className="relative mx-auto w-full max-w-lg"
              >
                {/* soft glow bloom behind the frame */}
                <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand-400/25 blur-2xl" />

                {/* floating browser-style frame */}
                <div className="animate-float overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-2 shadow-card-hover ring-1 ring-black/5 backdrop-blur-sm">
                  {/* faux browser chrome */}
                  <div className="flex items-center gap-1.5 px-2.5 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success-500/70" />
                    <div className="ml-3 hidden h-6 flex-1 items-center rounded-full bg-gray-100/80 px-3 text-[11px] font-medium text-ink-soft sm:flex">
                      claimmatch.com
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl bg-brand-900/5">
                    <video
                      autoPlay
                      muted
                      loop
                      playsInline
                      poster="/video/notification-walk-poster.jpg"
                      aria-label="A phone push notification arriving the moment you are owed settlement money"
                      className="aspect-[4/3] w-full max-w-full object-cover"
                    >
                      <source src="/video/notification-walk.mp4" type="video/mp4" />
                    </video>

                    {/* pure-CSS phone notification flourish */}
                    <div className="absolute inset-x-3 top-3">
                      <div className="animate-notif flex items-center gap-3 rounded-2xl border border-white/60 bg-white/95 px-3.5 py-2.5 shadow-card ring-1 ring-black/5 backdrop-blur">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                          <Bell className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 leading-tight">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                            ClaimMatch <span className="text-ink-soft/60">· now</span>
                          </div>
                          <div className="truncate text-sm font-bold text-ink">
                            You’re owed{' '}
                            <span className="tabular-nums text-success-600">~$180</span>{' '}
                            — tap to file
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works -------------------------------------------------------- */}
      <section className="container-page py-16 sm:py-20" id="how">
        <h2 className="text-center font-display text-3xl font-extrabold sm:text-4xl">
          How ClaimMatch works
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          We do the hunting and the filing. You just say yes.
        </p>
        <div className="stagger mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Search, title: 'We scan the settlements', body: 'Our system continuously pulls open class-action settlements and lawsuits from official sources into one place.' },
            { icon: ShieldCheck, title: 'We match you', body: 'Answer a few quick questions once. We compare your profile to every case and surface the ones you actually qualify for.' },
            { icon: FileText, title: 'You sign, we file', body: 'Authorize with one e-signature and we prepare and submit your claims to the official administrators — then track them to payout.' },
          ].map((s, i) => (
            <div
              key={i}
              style={{ '--i': i } as CSSProperties}
              className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured settlements ------------------------------------------------ */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="container-page">
          <div className="flex items-end justify-between">
            <div>
              <span className="badge-brand gap-1"><Sparkles className="h-3.5 w-3.5" /> AI Matched</span>
              <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
                Open settlements right now
              </h2>
            </div>
            <Link href="/lawsuits" className="hidden text-sm font-semibold text-brand-700 hover:text-brand-800 sm:inline-flex sm:items-center sm:gap-1">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="stagger mt-8 grid gap-6 md:grid-cols-3">
            {featured.map((l, i) => (
              <div key={l.id} style={{ '--i': i } as CSSProperties}>
                <LawsuitCard lawsuit={l} badge={{ label: 'AI Matched', tone: 'brand' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The day you get paid ------------------------------------------------ */}
      <section className="relative isolate overflow-hidden bg-white py-16 sm:py-24">
        <div className="pointer-events-none absolute -left-32 bottom-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-success-100/60 blur-[100px]" />
        <div className="container-page">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Video: settlement check pulled from the mailbox */}
            <div className="reveal relative order-last lg:order-first">
              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-success-500/15 blur-2xl" />
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-2 shadow-card-hover ring-1 ring-black/5 backdrop-blur-sm">
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/video/check-mail-poster.jpg"
                  aria-label="A settlement check being pulled from a mailbox — the day you get paid"
                  className="aspect-[4/3] w-full max-w-full rounded-2xl object-cover"
                >
                  <source src="/video/check-mail.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {/* Copy */}
            <div>
              <span className="badge-green gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> The day you get paid
              </span>
              <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                A real check, in your{' '}
                <span className="text-success-600">actual mailbox.</span>
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                When your claim is approved, the settlement pays out — straight to you.
                There’s nothing to chase and no forms to decode. We already filed it, and
                we only take our {FEE_LABEL} fee once you’ve been paid. Never a cent before.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: Lock, text: 'Nothing upfront — free to find and file your matches.' },
                  { icon: CheckCircle2, text: `No win, no fee. Our ${FEE_LABEL} only applies to money you receive.` },
                  { icon: Mail, text: 'Paid the way the settlement pays — to your mailbox or bank.' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-success-50 text-success-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm text-ink-muted">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link href="/signup" className="btn-primary w-full sm:w-auto">
                  See what you’re owed <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar ----------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="stagger grid gap-6 sm:grid-cols-3">
          {[
            ['$50B+', 'left unclaimed in settlements each year'],
            ['2 min', 'to set up your eligibility profile'],
            ['$0', 'to check — always free to find your matches'],
          ].map(([big, small], i) => (
            <div
              key={i}
              style={{ '--i': i } as CSSProperties}
              className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white shadow-card"
            >
              <div className="font-display text-3xl font-extrabold tabular-nums sm:text-4xl">{big}</div>
              <div className="mt-1 text-sm text-brand-100">{small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Email capture ------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16 sm:py-20">
        <div className="container-narrow text-center">
          <Mail className="mx-auto h-10 w-10 text-brand-600" />
          <h2 className="mt-4 font-display text-3xl font-extrabold sm:text-4xl">
            Get matched by email
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            New settlements open every week. Drop your email and we’ll alert you the
            moment one matches your profile.
          </p>
          <div className="mx-auto mt-6 max-w-md">
            <EmailCapture />
          </div>
          <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            {['No spam, ever', 'Unsubscribe anytime', 'Free forever'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success-500" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
