'use client';

import { useEffect } from 'react';
import { animate, stagger } from 'motion';

/**
 * Motion for the hero (motion.dev), applied to markup the server already
 * rendered in its finished state.
 *
 * Two things move, and only transform and opacity:
 *   1. the hero's text blocks rise in on a short stagger, once, on first load;
 *   2. the one primary button dips a little while it is pressed.
 *
 * Nothing here can shift layout, and nothing here is needed to read the page:
 * the HTML ships complete, so a visitor without JavaScript, with JavaScript
 * still loading, or with `prefers-reduced-motion: reduce` sees the final
 * state with no movement at all. The reduced-motion check runs before any
 * animation starts, and the entrance is skipped entirely when hydration
 * arrives late, so a slow connection never gets a late flash.
 */
export function HeroMotion({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const stops: Array<() => void> = [];

    // Entrance: only on a fresh load, so a late hydration does not re-reveal
    // content the visitor is already reading.
    const reveals = [...root.querySelectorAll<HTMLElement>('[data-hero-reveal]')];
    if (reveals.length > 0 && performance.now() < 1200) {
      const entrance = animate(
        reveals,
        { opacity: [0, 1], y: [14, 0] },
        { duration: 0.28, ease: 'easeOut', delay: stagger(0.04) },
      );
      stops.push(() => entrance.stop());
    }

    // Press feedback on the single primary call to action.
    const cta = root.querySelector<HTMLElement>('[data-hero-cta]');
    if (cta) {
      const to = (scale: number) => {
        animate(cta, { scale }, { duration: 0.14, ease: 'easeOut' });
      };
      const down = () => to(0.97);
      const up = () => to(1);
      cta.addEventListener('pointerdown', down);
      cta.addEventListener('pointerup', up);
      cta.addEventListener('pointercancel', up);
      cta.addEventListener('pointerleave', up);
      stops.push(() => {
        cta.removeEventListener('pointerdown', down);
        cta.removeEventListener('pointerup', up);
        cta.removeEventListener('pointercancel', up);
        cta.removeEventListener('pointerleave', up);
      });
    }

    return () => {
      for (const stop of stops) stop();
    };
  }, [rootId]);

  return null;
}
