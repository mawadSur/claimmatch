'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { MIN_TESTIMONIALS, publishableTestimonials, type Testimonial } from '@/lib/testimonials';
import { cn } from '@/lib/utils';

/**
 * Reviews slider. Fed only from real, consented reviews in
 * src/lib/testimonials.ts. Until there are MIN_TESTIMONIALS publishable
 * entries, this component renders nothing — no sample quotes, no empty shell.
 *
 * TODO: Add real, written-consent reviews to src/lib/testimonials.ts when we
 * have them. Never invent names, quotes, or payouts.
 */
export function Testimonials({
  items = publishableTestimonials(),
}: {
  items?: Testimonial[];
}) {
  const cards = items.length >= MIN_TESTIMONIALS ? items : [];
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  if (cards.length === 0) return null;

  const current = cards[index % cards.length]!;
  const go = (delta: number) => {
    setIndex((i) => (i + delta + cards.length) % cards.length);
  };

  return (
    <section aria-labelledby="reviews-heading" className="section-y bg-white">
      <div className="container-page">
        <div className="max-w-2xl" data-reveal>
          <p className="eyebrow">Reviews</p>
          <h2 id="reviews-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            From people who used Lawsuit AI
          </h2>
        </div>

        <div className="relative mx-auto mt-10 max-w-3xl" data-reveal>
          <figure className="rounded-3xl bg-brand-50 p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
            <Quote className="h-7 w-7 text-gold-400" aria-hidden />
            <blockquote
              key={current.name + current.receivedOn}
              className={cn(
                'mt-5 text-lg leading-relaxed text-ink sm:text-xl',
                !reduceMotion && 'transition-opacity duration-300',
              )}
            >
              “{current.quote}”
            </blockquote>
            <figcaption className="mt-6 text-sm">
              <span className="font-semibold text-ink">{current.name}</span>
              {current.location && <span className="text-ink-muted"> · {current.location}</span>}
              {current.context && <span className="mt-1 block text-ink-muted">{current.context}</span>}
            </figcaption>
          </figure>

          {cards.length > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-sm text-ink-muted" aria-live="polite">
                <span className="tabular text-ink">{index + 1}</span> of {cards.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary min-h-tap min-w-tap px-3"
                  aria-label="Previous review"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-tap min-w-tap px-3"
                  aria-label="Next review"
                  onClick={() => go(1)}
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-ink-muted">
          Shared with permission by Lawsuit AI users. Each settlement sets its own payments, so
          results vary.
        </p>
      </div>
    </section>
  );
}
