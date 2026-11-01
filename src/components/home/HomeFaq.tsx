import { ChevronDown } from 'lucide-react';
import { jsonLd } from '@/lib/jsonld';
import { BETA_FEE_COPY, OFFICIAL_FILING_IS_FREE, feeEveryClaimCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';

export function homeFaqItems(disclose = flags.feeDisclosure()) {
  return [
    {
      q: 'Is ClaimMatch free?',
      a: disclose
        ? feeEveryClaimCopy()
        : `${BETA_FEE_COPY} ${OFFICIAL_FILING_IS_FREE}`,
    },
    {
      q: 'Do you file claims for me?',
      a: 'No. You file every claim yourself on the official settlement website. ClaimMatch never files for you.',
    },
    {
      q: 'Do you handle settlement payments?',
      a: 'No. We never handle settlement payments. If a claim is paid, the settlement administrator pays you directly.',
    },
    {
      q: 'How does ClaimMatch make money?',
      a: disclose
        ? feeEveryClaimCopy()
        : 'ClaimMatch is free during beta. We don’t run ads or sell paid plans today, and we do not sell your personal information. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid.',
    },
    {
      q: 'Are these listings verified?',
      a: 'Most listings come from public sources and we have not checked them yet. Always confirm the deadline, who qualifies, and how to file on the official settlement site.',
    },
  ];
}

export function HomeFaq() {
  const items = homeFaqItems();
  return (
    <section className="container-page py-16 sm:py-20" aria-labelledby="home-faq-heading">
      <h2 id="home-faq-heading" className="font-display text-3xl font-bold sm:text-4xl">
        Questions
      </h2>
      <div className="mt-8 space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-card"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              {item.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />
    </section>
  );
}
