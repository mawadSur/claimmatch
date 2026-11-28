'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { animate } from 'motion';
import { cn } from '@/lib/utils';
import { HowIllustration } from './HowIllustrations';
import type { HowStep } from './how-it-works-types';

export type { HowStep };

/**
 * Three-step "How it works" with Motion. SVG illustrations stay light for the
 * HTML budget. On large screens the illustration swaps as each step crosses
 * mid-viewport; without JS every step stays fully readable.
 */
export function HowItWorks({ steps, caption }: { steps: HowStep[]; caption: string }) {
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEnhanced(true);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.step ?? 0));
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    for (const el of stepRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = artRef.current;
    if (!el || !enhanced) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animate(el, { opacity: [0.55, 1], transform: ['translateY(8px)', 'translateY(0px)'] }, {
      duration: 0.35,
      ease: 'easeOut',
    });
  }, [active, enhanced]);

  const current = steps[active] ?? steps[0];

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="section-y relative border-y border-slate-200/70 bg-brand-50"
    >
      <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-20">
        <div>
          <div className="max-w-2xl" data-reveal>
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
              Three calm steps from questions to a filed claim
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">
              Matching is free. You never need a card to see what may fit you.
            </p>
          </div>

          <ol className="mt-12 space-y-16 lg:mt-0 lg:space-y-0">
            {steps.map((step, i) => {
              const state = !enhanced || i === active ? 'active' : i < active ? 'done' : 'next';
              return (
                <li
                  key={step.title}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  data-step={i}
                  className="lg:flex lg:min-h-[52vh] lg:items-center"
                >
                  <div
                    className={cn(
                      'transition-opacity duration-500',
                      state === 'active' ? 'opacity-100' : 'lg:opacity-70',
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        aria-hidden
                        className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold tabular ring-1 transition-colors duration-500',
                          state === 'active' && 'bg-brand-700 text-white ring-brand-700',
                          state === 'done' && 'bg-brand-100 text-brand-700 ring-brand-200',
                          state === 'next' && 'bg-white text-ink-muted ring-slate-300',
                        )}
                      >
                        {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                      </span>
                      <h3 className="text-2xl font-semibold">
                        <span className="sr-only">Step {i + 1}: </span>
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
                      {step.body}
                    </p>
                    <ul className="mt-5 space-y-2.5">
                      {step.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-sm text-ink sm:text-base">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-50 text-success-700 ring-1 ring-success-100">
                            <Check className="h-3 w-3" aria-hidden strokeWidth={3} />
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8 lg:hidden" data-reveal="scale">
                      <HowIllustration kind={step.illustration} className="mx-auto h-auto w-full max-w-xs" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="mt-12 text-sm text-ink-muted lg:mt-0">{caption}</p>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-[max(5.5rem,calc(50vh_-_10rem))]">
            <div
              ref={artRef}
              className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-slate-200"
            >
              {current && (
                <HowIllustration kind={current.illustration} className="h-auto w-full" />
              )}
            </div>
            <div className="mt-6" aria-hidden>
              <div className="flex gap-1.5">
                {steps.map((step, i) => (
                  <span
                    key={step.title}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-500',
                      i <= active ? 'bg-brand-600' : 'bg-slate-300/70',
                    )}
                  />
                ))}
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-ink-muted">
                <span className="tabular text-ink">Step {active + 1}</span> of {steps.length} ·{' '}
                {current?.title}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
