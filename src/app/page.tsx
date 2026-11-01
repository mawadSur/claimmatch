import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  HandCoins,
  Scale,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { lookupLawsuits } from '@/lib/lawsuits';
import { pickClosingSoon } from '@/lib/closing-soon';
import { HomeNarrowing } from '@/components/home/HomeNarrowing';
import { HomeSettlementList } from '@/components/home/HomeSettlementList';
import { HomeFaq } from '@/components/home/HomeFaq';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { flags } from '@/lib/flags';
import { homeWedgeAvailability, homeWedgesEnabled } from '@/lib/home-wedges';
import { publicPageMetadata } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';
import type { Metadata } from 'next';

const STEPS = [
  {
    title: 'Find an open settlement',
    body: 'Browse settlements that are taking claims, with the payout and deadline we have on file.',
  },
  {
    title: 'Check the official notice',
    body: 'Read who qualifies on the official site, then file there yourself. Filing is free.',
  },
  {
    title: 'Keep track here',
    body: 'Save the confirmation number the official site gives you. Your claims stay in one list.',
  },
];

const homeMeta = publicPageMetadata({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  path: '/',
  ogTitle: `${SITE.name} — ${SITE.tagline}`,
});
export const metadata: Metadata = {
  ...homeMeta,
  // Skip the layout "%s · ClaimMatch" template so the site name is not doubled.
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
};

async function loadHomeCatalog(): Promise<{ lawsuits: Lawsuit[]; failed: boolean }> {
  try {
    // lookupLawsuits() applies the shared open-for-claims rule and reports a
    // failed query (getLawsuits() would turn it into "no settlements"); we
    // only order.
    const result = await lookupLawsuits();
    if (result.error) return { lawsuits: [], failed: true };
    return { lawsuits: result.lawsuits, failed: false };
  } catch {
    return { lawsuits: [], failed: true };
  }
}

export default async function HomePage() {
  const catalog = await loadHomeCatalog();
  const closing = { rows: pickClosingSoon(catalog.lawsuits, 5), failed: catalog.failed };
  const wedges = homeWedgesEnabled() ? homeWedgeAvailability(catalog.lawsuits) : null;
  const disclose = flags.feeDisclosure();
  const accountFirst = flags.homeAccountFirstCta();

  return (
    <>
      <CaptureOnce event="landing_viewed" />

      <section className="bg-brand-50">
        <div className="container-page py-14 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-brand-700">
              {disclose ? 'Official filing stays free' : 'Free during beta'}
            </p>
            <h1 className="mt-3 font-display text-[2.25rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Find settlement money that may be yours
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
              Check open class-action settlements, file on the official site, and
              keep track of your claims here.
            </p>
            <div className="mt-8">
              <Link
                href={accountFirst ? '/signup' : '/lawsuits'}
                className="btn-primary w-full sm:w-auto"
              >
                {accountFirst ? 'Create a free account' : 'See open settlements'}
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-muted">
              {[
                {
                  icon: CheckCircle2,
                  text: disclose ? 'Official filing stays free' : 'Free during beta',
                },
                { icon: HandCoins, text: 'We never handle settlement payments' },
                { icon: Scale, text: 'Not a law firm' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-brand-600" aria-hidden /> {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" aria-labelledby="steps-heading">
        <div className="container-page">
          <h2 id="steps-heading" className="font-display text-3xl font-bold sm:text-4xl">
            How it works
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-brand-50 py-16 sm:py-20" aria-labelledby="open-heading">
        <div className="container-page">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="open-heading" className="font-display text-3xl font-bold sm:text-4xl">
                Open settlements
              </h2>
              <p className="mt-2 text-ink-muted">
                Payout amounts and deadlines as the listing states them.
              </p>
            </div>
            <Link href="/lawsuits" className="text-link inline-flex min-h-tap items-center gap-1">
              See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
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
              className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
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
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="font-semibold text-ink">No deadlines coming up right now.</p>
              <p className="mt-1 text-sm text-ink-muted">
                New settlements open all the time. See everything that is open today.
              </p>
              <Link href="/lawsuits" className="btn-secondary mt-6">
                Browse open settlements
              </Link>
            </div>
          ) : (
            <div className="mt-8">
              <HomeSettlementList lawsuits={closing.rows} />
            </div>
          )}
        </div>
      </section>

      {wedges && (wedges.showBreachPrivacy || wedges.showNoProof) && (
        <HomeNarrowing
          showBreachPrivacy={wedges.showBreachPrivacy}
          showDataBreach={wedges.showDataBreach}
          showPrivacy={wedges.showPrivacy}
          showNoProof={wedges.showNoProof}
        />
      )}

      <section className="bg-white py-16 sm:py-20">
        <div className="container-page">
          <HowWeMakeMoney />
        </div>
      </section>

      <HomeFaq />
    </>
  );
}
