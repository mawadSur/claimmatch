import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Search, ShieldCheck, ListChecks, ExternalLink, ClipboardCheck,
  CheckCircle2, XCircle, Info, AlertCircle, HandCoins, Scale,
} from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { getLawsuits } from '@/lib/lawsuits';
import { pickClosingSoon } from '@/lib/closing-soon';
import { LawsuitCard } from '@/components/LawsuitCard';

const STEPS = [
  {
    icon: Search,
    title: 'Find an open settlement',
    body: 'Browse settlements that are open for claims and see their deadlines.',
  },
  {
    icon: ListChecks,
    title: 'Check if you qualify',
    body: 'Read who qualifies on the official notice. File only if it describes you.',
  },
  {
    icon: ExternalLink,
    title: 'File on the official site',
    body: 'Fill out the claim form on the settlement’s official website. Filing is free.',
  },
  {
    icon: ClipboardCheck,
    title: 'Keep track here',
    body: 'Tell us when you have filed and add your confirmation number. Your claims stay in one list.',
  },
];

const WE_DO = [
  'List settlements that are open for claims, with their deadlines',
  'Link to the official settlement site so you can check details and file',
  'Keep track of the claims you tell us you filed',
  'Stay free to use',
];

const WE_DO_NOT = [
  'File or submit claims for you',
  'Touch your settlement money or take a cut',
  'Give legal advice or decide whether you qualify',
  'Sell your personal information',
];

async function loadClosingSoon(): Promise<{ rows: Lawsuit[]; failed: boolean }> {
  try {
    // getLawsuits() applies the shared open-for-claims rule; we only order.
    const rows = await getLawsuits();
    return { rows: pickClosingSoon(rows, 3), failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

export default async function HomePage() {
  const closing = await loadClosingSoon();

  return (
    <>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page relative py-16 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <div className="stagger max-w-xl text-center lg:text-left">
              <span
                style={{ '--i': 0 } as CSSProperties}
                className="badge-brand mx-auto gap-1.5 ring-1 ring-inset ring-brand-200/70 lg:mx-0"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Free claim assistant
              </span>

              <h1
                style={{ '--i': 1 } as CSSProperties}
                className="mt-5 font-display text-[2.4rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.6rem]"
              >
                Find open settlements.{' '}
                <span className="text-brand-600">File on the official site.</span>
              </h1>

              <p
                style={{ '--i': 2 } as CSSProperties}
                className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted lg:mx-0"
              >
                Check if you qualify on the official notice, file your claim on the
                settlement’s own website, then keep track of it here.
              </p>

              <div
                style={{ '--i': 3 } as CSSProperties}
                className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
              >
                <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
                  <Search className="h-4 w-4" aria-hidden /> Browse open settlements
                </Link>
                <Link href="/signup" className="btn-secondary w-full sm:w-auto">
                  Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <ul
                style={{ '--i': 4 } as CSSProperties}
                className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-muted lg:justify-start"
              >
                {[
                  { icon: CheckCircle2, text: 'Free to use' },
                  { icon: HandCoins, text: 'We never take a cut' },
                  { icon: Scale, text: 'Not a law firm' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-brand-600" aria-hidden /> {text}
                  </li>
                ))}
              </ul>
            </div>

            {/* How a claim works, at a glance ----------------------------------- */}
            <div
              className="reveal mx-auto w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-card sm:p-8"
              aria-labelledby="steps-heading"
              role="region"
            >
              <h2 id="steps-heading" className="text-lg font-bold">
                How it works
              </h2>
              <ol className="mt-5 space-y-5">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                      <s.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-bold">
                        <span className="sr-only">Step {i + 1}: </span>
                        {s.title}
                      </h3>
                      <p className="mt-1 text-sm text-ink-muted">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 rounded-xl bg-gray-50 p-3 text-sm text-ink-muted">
                You should never have to pay to file a settlement claim. If someone
                asks you for a fee, be careful.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing soon --------------------------------------------------------- */}
      <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="closing-heading">
        <div className="container-page">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="closing-heading" className="font-display text-3xl font-extrabold sm:text-4xl">
                Closing soon
              </h2>
              <p className="mt-2 text-ink-muted">
                Open settlements with the nearest claim deadlines.
              </p>
            </div>
            <Link
              href="/lawsuits"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See all open settlements <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">Unverified: check the official site.</strong>{' '}
              These listings come from SettleSignal, a public data source, and we
              haven’t checked them yet. Before you file, confirm the deadline (including
              the exact cutoff time) and who qualifies on the official settlement site.
            </p>
          </div>

          {closing.failed ? (
            <div
              role="alert"
              className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center"
            >
              <AlertCircle className="h-8 w-8 text-danger-700" aria-hidden />
              <p className="mt-3 font-semibold text-ink">
                We couldn’t load settlements right now.
              </p>
              <p className="mt-1 text-sm text-ink-muted">Please try again in a moment.</p>
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Go to all settlements
              </Link>
            </div>
          ) : closing.rows.length === 0 ? (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <p className="font-semibold text-ink">No deadlines coming up right now.</p>
              <p className="mt-1 text-sm text-ink-muted">
                New settlements open all the time. See everything that is open today.
              </p>
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Browse open settlements
              </Link>
            </div>
          ) : (
            <div className="stagger mt-8 grid gap-6 md:grid-cols-3">
              {closing.rows.map((l, i) => (
                <div key={l.id} style={{ '--i': i } as CSSProperties}>
                  <LawsuitCard lawsuit={l} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* What we do and don't do --------------------------------------------- */}
      <section className="container-page py-16 sm:py-20" aria-labelledby="honest-heading">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="honest-heading" className="font-display text-3xl font-extrabold sm:text-4xl">
            What ClaimMatch does, and doesn’t do
          </h2>
          <p className="mt-3 text-ink-muted">
            ClaimMatch is a free claim assistant. You stay in charge of every claim.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h3 className="text-lg font-bold">We do</h3>
            <ul className="mt-4 space-y-3">
              {WE_DO.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h3 className="text-lg font-bold">We don’t</h3>
            <ul className="mt-4 space-y-3">
              {WE_DO_NOT.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
          Want the details?{' '}
          <Link href="/how-it-works" className="font-semibold text-brand-700 underline hover:text-brand-800">
            How it works
          </Link>{' '}
          ·{' '}
          <Link href="/trust" className="font-semibold text-brand-700 underline hover:text-brand-800">
            Is ClaimMatch legit?
          </Link>
        </p>
      </section>

      {/* CTA ------------------------------------------------------------------ */}
      <section className="bg-gradient-to-b from-white to-brand-50 py-16 sm:py-20">
        <div className="container-narrow text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Ready to look?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            See which settlements are open now, or create a free account to keep track
            of the claims you file.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
            <Link href="/signup" className="btn-secondary w-full sm:w-auto">
              Create a free account
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
