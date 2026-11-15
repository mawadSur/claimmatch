import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Search } from 'lucide-react';
import { Disclaimer } from '@/components/Disclaimer';
import { faqGroups } from '@/lib/faq';
import { jsonLd } from '@/lib/jsonld';
import { publicPageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = publicPageMetadata({
  title: 'FAQ',
  description:
    'Answers about class action settlements and Lawsuit AI: who qualifies, proof of purchase, payouts, when you get paid, how filing works, and your account.',
  path: '/faq',
});

export default function FaqPage() {
  const groups = faqGroups();

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge-brand mx-auto">FAQ</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Frequently asked questions
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
              Straight answers about class action settlements and how Lawsuit AI works.
            </p>
            <nav aria-label="FAQ sections" className="mt-8 flex flex-wrap justify-center gap-2">
              {groups.map((g) => (
                <a
                  key={g.id}
                  href={`#${g.id}`}
                  className="inline-flex min-h-tap items-center rounded-full bg-white px-4 text-sm font-semibold text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {g.title}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <div className="container-narrow space-y-14 pb-16">
        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-heading`} className="scroll-mt-24">
            <h2 id={`${g.id}-heading`} className="text-2xl font-extrabold sm:text-3xl">
              {g.title}
            </h2>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {g.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold text-ink transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-slate-200 transition-transform duration-300 group-open:rotate-180">
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </span>
                  </summary>
                  <p className="-mt-1 max-w-2xl pb-6 text-base leading-relaxed text-ink-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl bg-brand-50 p-8 text-center" aria-labelledby="faq-cta-heading">
          <h2 id="faq-cta-heading" className="text-2xl font-extrabold">Still have a question?</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            See the step-by-step guide, or browse what is open for claims today.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/how-it-works" className="btn-primary w-full sm:w-auto">
              How it works <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/lawsuits" className="btn-secondary w-full sm:w-auto">
              <Search className="h-4 w-4" aria-hidden /> Browse open settlements
            </Link>
          </div>
        </section>

        <Disclaimer />
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: groups.flatMap((g) =>
              g.items.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            ),
          }),
        }}
      />
    </>
  );
}
