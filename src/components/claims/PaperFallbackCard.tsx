import { PAPER_FALLBACK_CTA, PAPER_FALLBACK_HEADING, PAPER_FALLBACK_OFFICIAL_CTA, paperFallbackBody } from '@/lib/pin-admin-email';

export function PaperFallbackCard({
  formHref,
  officialHref,
  days,
}: {
  formHref: string;
  officialHref?: string | null;
  days?: number;
}) {
  const official = officialHref && officialHref !== formHref ? officialHref : null;
  return (
    <section
      aria-labelledby="paper-fallback-title"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-ink"
    >
      <h3 id="paper-fallback-title" className="font-bold">
        {PAPER_FALLBACK_HEADING}
      </h3>
      <p className="mt-1 leading-relaxed">{paperFallbackBody(days)}</p>
      <p className="mt-3">
        <a href={formHref} className="font-semibold text-brand-700 underline underline-offset-2" target={formHref.startsWith('http') ? '_blank' : undefined} rel={formHref.startsWith('http') ? 'noopener noreferrer' : undefined}>
          {PAPER_FALLBACK_CTA}
        </a>
      </p>
      {official && (
        <p className="mt-2">
          <a href={official} className="font-semibold text-brand-700 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            {PAPER_FALLBACK_OFFICIAL_CTA}
          </a>
        </p>
      )}
    </section>
  );
}
