'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhoneFrame, type Screen } from './DeviceFrame';

export interface HowStep {
  title: string;
  body: string;
  points: string[];
  screen: Screen;
}

/**
 * "How it works" as a scroll story. On large screens a phone stays pinned
 * beside the steps and swaps to each step's real app screen as that step
 * crosses the middle of the viewport. On small screens every step shows its
 * own screen inline. Without JavaScript all steps stay fully visible and the
 * pinned phone shows the first screen.
 */
export function HowItWorks({ steps, caption }: { steps: HowStep[]; caption: string }) {
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    setEnhanced(true);
    // A thin band across the middle of the viewport: the step crossing it is active.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.step ?? 0));
          }
        }
      },
      { rootMargin: '-48% 0px -48% 0px', threshold: 0 },
    );
    for (const el of stepRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const first = steps[0]?.screen;

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="section-y relative border-y border-slate-200/70 bg-brand-50"
    >
      <div className="container-page grid gap-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-20 xl:gap-28">
        <div>
          <div className="max-w-2xl" data-reveal>
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
              From open settlement to the official claim form
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">
              Four steps, all in one place. These are real screens from the app.
            </p>
          </div>

          <ol className="mt-14 space-y-20 lg:mt-0 lg:space-y-0">
            {steps.map((step, i) => {
              const state = !enhanced || i === active ? 'active' : i < active ? 'done' : 'next';
              return (
                <li
                  key={step.title}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  data-step={i}
                  className="lg:flex lg:min-h-[64vh] lg:items-center"
                >
                  <div
                    className={cn(
                      'transition-opacity duration-500',
                      // Dimmed, not faded out: inactive steps stay readable (WCAG contrast).
                      state === 'active' ? 'opacity-100' : 'lg:opacity-70',
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        aria-hidden
                        className={cn(
                          'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold tabular ring-1 transition-colors duration-500',
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
                    {/* Small screens: each step carries its own screen. */}
                    <div className="mt-10 flex justify-center lg:hidden" data-reveal="scale">
                      <PhoneFrame screen={step.screen} className="w-[16.5rem]" sizes="16.5rem" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="mt-16 text-sm text-ink-muted lg:mt-0">{caption}</p>
        </div>

        {/* Large screens: one pinned phone whose screen follows the active step. */}
        <div className="hidden lg:block">
          <div className="sticky top-[max(5.5rem,calc(50vh_-_20.5rem))]">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-10 -z-10 rounded-full bg-gradient-to-b from-brand-200/70 via-brand-100/40 to-transparent blur-2xl"
              />
              <PhoneFrame className="mx-auto w-[18rem]">
                <div
                  className="relative"
                  style={{ aspectRatio: first ? `${first.width} / ${first.height}` : '390 / 844' }}
                >
                  {steps.map((step, i) => (
                    <Image
                      key={step.screen.src}
                      src={step.screen.src}
                      alt={step.screen.alt}
                      width={step.screen.width}
                      height={step.screen.height}
                      sizes="18rem"
                      aria-hidden={i !== active}
                      className={cn(
                        'absolute inset-0 h-full w-full object-cover object-top transition-[opacity,transform] duration-500 ease-out',
                        i === active ? 'scale-100 opacity-100' : 'scale-[0.985] opacity-0',
                      )}
                    />
                  ))}
                </div>
              </PhoneFrame>
            </div>
            <div className="mx-auto mt-6 w-[18rem]" aria-hidden>
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
                {steps[active]?.title}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
