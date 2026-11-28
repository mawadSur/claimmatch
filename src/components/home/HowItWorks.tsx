'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HowStep } from './how-it-works-types';

export type { HowStep };

/**
 * Three-step "How it works". One line of body copy per step. On large screens
 * the active step tracks mid-viewport; without JS every step stays readable.
 */
export function HowItWorks({ steps, caption }: { steps: HowStep[]; caption: string }) {
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

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

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="section-y relative border-y border-slate-200/70 bg-brand-50"
    >
      <div className="container-page max-w-3xl">
        <div data-reveal>
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            Three steps to a filed claim
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            Matching is free. No card needed to start.
          </p>
        </div>

        <ol className="mt-10 space-y-10">
          {steps.map((step, i) => {
            const state = !enhanced || i === active ? 'active' : i < active ? 'done' : 'next';
            return (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
              >
                <div
                  className={cn(
                    'transition-opacity duration-500',
                    state === 'active' ? 'opacity-100' : 'opacity-70',
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
                  <p className="mt-3 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
                    {step.body}
                  </p>
                  {step.points.length > 0 && (
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
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-10 text-sm text-ink-muted">{caption}</p>
      </div>
    </section>
  );
}
