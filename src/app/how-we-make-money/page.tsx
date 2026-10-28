import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HowWeMakeMoney } from '@/components/HowWeMakeMoney';
import { Disclaimer } from '@/components/Disclaimer';
import { feeEveryClaimCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { SITE, canonicalUrl } from '@/lib/utils';

export function generateMetadata(): Metadata {
  const disclose = flags.feeDisclosure();
  const description = disclose
    ? feeEveryClaimCopy()
    : 'ClaimMatch is free during beta; copy-ready details; you file on the official site.';
  return {
    title: 'How ClaimMatch makes money',
    description,
    alternates: { canonical: canonicalUrl('/how-we-make-money') },
    openGraph: {
      title: 'How ClaimMatch makes money',
      description: disclose
        ? description
        : 'Free during beta; copy-ready details; you file on the official site.',
      url: canonicalUrl('/how-we-make-money'),
      siteName: SITE.name,
      type: 'website',
    },
  };
}

export default function HowWeMakeMoneyPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-page relative py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <HowWeMakeMoney heading="h1" />
          </div>
        </div>
      </section>
      <section className="container-narrow pb-16">
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="btn-primary w-full sm:w-auto">
            Find my settlements <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/pricing" className="btn-secondary w-full sm:w-auto">
            Pricing
          </Link>
        </div>
        <div className="mx-auto mt-10 max-w-2xl">
          <Disclaimer />
        </div>
      </section>
    </>
  );
}
