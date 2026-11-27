'use client';

import { useEffect } from 'react';
import { animate } from 'motion';

/**
 * Motion for the hero (motion.dev).
 *
 * It animates the one thing that cannot be done at first paint: feedback while
 * the primary call to action is actually being pressed. The hero's entrance is
 * pure CSS (`.stagger` + `--i` in globals.css), which runs as part of the first
 * paint and so cannot blank out content the browser has already shown.
 *
 * An earlier version ran the entrance here, from an effect, animating
 * `opacity: [0, 1]` against server HTML that ships fully visible. That hid and
 * re-revealed the headline, the payout card and the CTA for roughly 440ms
 * after hydration — worst in the common case, where hydration lands a few
 * hundred milliseconds after paint. Entrances belong in CSS; interaction
 * belongs here.
 *
 * Only `transform` moves, so nothing can shift layout. The reduced-motion
 * check runs before anything animates, and globals.css additionally collapses
 * every animation duration under `prefers-reduced-motion: reduce`.
 */
export function HeroMotion({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cta = root.querySelector<HTMLElement>('[data-hero-cta]');
    if (!cta) return;

    const to = (scale: number) => {
      animate(cta, { scale }, { duration: 0.14, ease: 'easeOut' });
    };
    const down = () => to(0.97);
    const up = () => to(1);
    const events: Array<[string, () => void]> = [
      ['pointerdown', down],
      ['pointerup', up],
      ['pointercancel', up],
      ['pointerleave', up],
    ];
    for (const [name, handler] of events) cta.addEventListener(name, handler);
    return () => {
      for (const [name, handler] of events) cta.removeEventListener(name, handler);
    };
  }, [rootId]);

  return null;
}
