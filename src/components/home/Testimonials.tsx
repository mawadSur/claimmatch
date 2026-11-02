import type { CSSProperties } from 'react';
import { Quote } from 'lucide-react';
import { MIN_TESTIMONIALS, publishableTestimonials, type Testimonial } from '@/lib/testimonials';

/**
 * Reviews from real users, verbatim and with permission (see
 * src/lib/testimonials.ts). Renders nothing until there are enough of them;
 * in development it shows a note so the empty slot is easy to find.
 */
export function Testimonials({ items = publishableTestimonials() }: { items?: Testimonial[] }) {
  if (items.length < MIN_TESTIMONIALS) {
    if (process.env.NODE_ENV !== 'development') return null;
    return (
      <div className="container-page py-8">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm leading-relaxed text-ink-muted">
          <p className="font-semibold text-ink">Reviews slot (shown only in development)</p>
          <p className="mt-1">
            This section goes live once src/lib/testimonials.ts holds {MIN_TESTIMONIALS} real
            reviews, each published with the person’s permission. {items.length} so far.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="reviews-heading" className="section-y bg-white">
      <div className="container-page">
        <div className="max-w-2xl" data-reveal>
          <p className="eyebrow">In their words</p>
          <h2 id="reviews-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            From people who used ClaimMatch
          </h2>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {items.slice(0, 6).map((t, i) => (
            <li
              key={`${t.name}-${t.receivedOn}`}
              data-reveal
              style={{ '--reveal-at': (i % 3) * 6 } as CSSProperties}
            >
              <figure className="surface flex h-full flex-col p-6">
                <Quote className="h-6 w-6 text-gold-400" aria-hidden />
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
        <p className="mt-6 text-xs text-ink-muted">
          Shared with permission by ClaimMatch users. Each settlement sets its own payments, so
          results vary.
        </p>
      </div>
    </section>
  );
}
