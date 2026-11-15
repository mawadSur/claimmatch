import type { CSSProperties } from 'react';
import { Quote } from 'lucide-react';
import { MIN_TESTIMONIALS, publishableTestimonials, type Testimonial } from '@/lib/testimonials';
import {
  SAMPLE_TESTIMONIALS,
  showSampleTestimonials,
  type SampleTestimonial,
} from '@/lib/sample-testimonials';

type Card = Pick<Testimonial, 'quote' | 'name' | 'location' | 'context'>;

/**
 * Reviews from real users, verbatim and with permission (see
 * src/lib/testimonials.ts). Until there are enough of them, production renders
 * nothing; local development and Vercel previews show clearly labeled sample
 * placeholders (src/lib/sample-testimonials.ts) so the layout can be reviewed.
 */
export function Testimonials({
  items = publishableTestimonials(),
  samples = SAMPLE_TESTIMONIALS,
  showSamples = showSampleTestimonials(),
}: {
  items?: Testimonial[];
  samples?: readonly SampleTestimonial[];
  showSamples?: boolean;
}) {
  const real = items.length >= MIN_TESTIMONIALS;
  if (!real && !showSamples) return null;
  const cards: Card[] = real ? items : [...samples];

  return (
    <section aria-labelledby="reviews-heading" className="section-y bg-white">
      <div className="container-page">
        <div className="max-w-2xl" data-reveal>
          <p className="eyebrow">Reviews</p>
          <h2 id="reviews-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            From people who used Lawsuit AI
          </h2>
          {!real && (
            <p className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
              <strong className="font-semibold">Sample reviews, not from real users.</strong>{' '}
              Shown only in development and preview builds. Replace them with real, consented
              reviews in src/lib/testimonials.ts ({items.length} of {MIN_TESTIMONIALS} so far).
            </p>
          )}
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {cards.slice(0, 6).map((t, i) => (
            <li
              key={`${t.name}-${i}`}
              data-reveal
              style={{ '--reveal-at': (i % 3) * 6 } as CSSProperties}
            >
              <figure className="surface flex h-full flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <Quote className="h-6 w-6 text-gold-400" aria-hidden />
                  {!real && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      Sample
                    </span>
                  )}
                </div>
                <blockquote className="mt-4 flex-1 text-base leading-relaxed text-ink">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-6 border-t border-slate-100 pt-4 text-sm">
                  <span className="font-semibold text-ink">{t.name}</span>
                  {t.location && <span className="text-ink-muted"> · {t.location}</span>}
                  {t.context && <span className="mt-1 block text-ink-muted">{t.context}</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        {real && (
          <p className="mt-6 text-xs text-ink-muted">
            Shared with permission by Lawsuit AI users. Each settlement sets its own payments, so
            results vary.
          </p>
        )}
      </div>
    </section>
  );
}
