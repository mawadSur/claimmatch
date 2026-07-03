import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, Mail, FileText, Sparkles, CheckCircle2,
} from 'lucide-react';
import { getLawsuits } from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import { EmailCapture } from '@/components/EmailCapture';

export default async function HomePage() {
  const featured = await getLawsuits({ featured: true, limit: 3 });

  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Free to check · No win, no fee
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-6xl">
              Find the settlement money{' '}
              <span className="text-brand-600">you’re owed.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Billions in class-action settlements go unclaimed every year. ClaimMatch
              scans open cases, matches you to the ones you qualify for, and helps you
              file your claim in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Find my settlements <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
                <Search className="h-4 w-4" /> Browse all settlements
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-soft">
              Takes 2 minutes · We’ll email you when new matches open up
            </p>
          </div>
        </div>
      </section>

      {/* How it works -------------------------------------------------------- */}
      <section className="container-page py-16" id="how">
        <h2 className="text-center text-3xl font-extrabold">How ClaimMatch works</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          We do the hunting. You do the claiming.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Search, title: 'We scan the settlements', body: 'Our system continuously pulls open class-action settlements and lawsuits from official sources into one place.' },
            { icon: ShieldCheck, title: 'We match you', body: 'Answer a few quick questions once. We compare your profile to every case and surface the ones you actually qualify for.' },
            { icon: FileText, title: 'You file in minutes', body: 'We pre-fill the right claim form and walk you through it. Then we email you the moment new matches appear.' },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured settlements ------------------------------------------------ */}
      <section className="bg-gray-50 py-16">
        <div className="container-page">
          <div className="flex items-end justify-between">
            <div>
              <span className="badge-brand gap-1"><Sparkles className="h-3.5 w-3.5" /> AI Matched</span>
              <h2 className="mt-3 text-3xl font-extrabold">Open settlements right now</h2>
            </div>
            <Link href="/lawsuits" className="hidden text-sm font-semibold text-brand-700 hover:text-brand-800 sm:inline-flex sm:items-center sm:gap-1">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {featured.map((l) => (
              <LawsuitCard key={l.id} lawsuit={l} badge={{ label: 'AI Matched', tone: 'brand' }} />
            ))}
          </div>
        </div>
      </section>

      {/* Trust bar ----------------------------------------------------------- */}
      <section className="container-page py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ['$50B+', 'left unclaimed in settlements each year'],
            ['2 min', 'to set up your eligibility profile'],
            ['$0', 'to check — always free to find your matches'],
          ].map(([big, small], i) => (
            <div key={i} className="rounded-2xl bg-brand-600 p-6 text-center text-white">
              <div className="text-3xl font-extrabold">{big}</div>
              <div className="mt-1 text-sm text-brand-100">{small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Email capture ------------------------------------------------------- */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16">
        <div className="container-narrow text-center">
          <Mail className="mx-auto h-10 w-10 text-brand-600" />
          <h2 className="mt-4 text-3xl font-extrabold">Get matched by email</h2>
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
